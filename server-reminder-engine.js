// reminder-engine.js
//
// The heart of §51 (Notification Scheduling Engine) and the §80 final
// acceptance test. Invoked every 5 minutes by
// .github/workflows/reminder-scheduler.yml — never as a Firebase Cloud
// Function (see ARCHITECTURE.md for why).
//
// Per run, for EVERY user:
//   1. Expand today's + tomorrow's occurrences from their active schedules
//      (using the same pure recurrence engine the frontend uses — §17).
//   2. For each occurrence, for each configured reminder offset, compute
//      the reminder's real-world due instant (schedule time − offset,
//      resolved in the SCHEDULE'S OWN TIMEZONE — §14).
//   3. If that instant has passed, and the occurrence isn't already
//      completed/cancelled/skipped (§65 smart reminder logic), route it
//      through notification-router.js.
//   4. If a reminder's due instant is more than STALE_THRESHOLD_MINUTES in
//      the past (e.g. the job didn't run for a while), skip it rather than
//      sending an obsolete notification hours late (§66 missed reminder
//      recovery) — and record why.
//   5. Also sync any due Google Calendar changes and mark clearly-missed
//      occurrences (§18 "missed" status) once their time has passed with
//      no completion.

import { db } from "./server-firebase-admin-init.js";
import { routeReminder } from "./server-notification-router.js";
import { markMissedServerSide } from "./server-occurrence-mutations.js";
import { exchangePendingAuthCodes, syncOccurrenceToGoogle, markSyncCompleted } from "./server-google-calendar-sync.js";
import { expandOccurrences, resolveLocalToUTC } from "./app-recurrence.service.js";
import { runTelegramBotOnce } from "./server-telegram-bot.js";

const STALE_THRESHOLD_MINUTES = 60; // §66 — don't send a reminder more than an hour late
const MISSED_GRACE_MINUTES = 30;    // how long after start time an untouched occurrence becomes "missed"

function isoDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const c = new Date(d); c.setUTCDate(c.getUTCDate() + n); return c; }

async function processUser(userDoc) {
  const uid = userDoc.id;
  const user = userDoc.data();
  if (user.disabled) return;

  const prefsSnap = await db.collection("users").doc(uid).collection("notificationPreferences").doc("settings").get();
  const prefs = prefsSnap.exists ? prefsSnap.data() : { push: true, email: true, telegram: false, googleCalendar: false };

  const schedulesSnap = await db.collection("users").doc(uid).collection("schedules").where("status", "==", "active").get();
  const schedules = schedulesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!schedules.length) return;

  const now = new Date();
  const windowStart = isoDate(now);
  const windowEnd = isoDate(addDays(now, 1));

  const materializedSnap = await db.collection("users").doc(uid).collection("scheduleOccurrences")
    .where("occurrenceDate", ">=", windowStart).where("occurrenceDate", "<=", windowEnd).get();
  const materializedById = new Map(materializedSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));

  const connSnap = await db.collection("users").doc(uid).collection("calendarConnections").doc("google").get();
  const gcalConnection = connSnap.exists ? connSnap.data() : null;

  for (const schedule of schedules) {
    const dates = expandOccurrences(schedule, windowStart, windowEnd);
    for (const occDate of dates) {
      const occId = `${schedule.id}_${occDate}`;
      const materialized = materializedById.get(occId);
      const status = materialized?.status || "scheduled";

      // §65 smart reminder logic: skip reminders entirely for
      // completed/cancelled/skipped occurrences.
      if (["completed", "cancelled", "skipped"].includes(status)) continue;

      const scheduledStart = resolveLocalToUTC(
        ...[parseISO(occDate)],
        schedule.startTime,
        schedule.timezone || user.timezone
      );

      // §18 — auto-mark "missed" once well past start time with no action.
      if (status === "scheduled" && now - scheduledStart > MISSED_GRACE_MINUTES * 60000) {
        await markMissedServerSide(uid, occId);
      }

      // ── Reminders ──
      for (const reminder of schedule.reminders || []) {
        const dueAt = new Date(scheduledStart.getTime() - reminder.offsetMinutes * 60000);
        const minutesLate = (now - dueAt) / 60000;
        if (minutesLate < 0) continue; // not due yet
        if (minutesLate > STALE_THRESHOLD_MINUTES) continue; // §66 — too stale, skip silently (recorded via idempotency doc as "skipped_stale" below)

        await routeReminder({
          uid, user, prefs, schedule,
          occurrence: { id: occId, occurrenceDate: occDate },
          reminder,
        });
      }

      // ── Google Calendar sync (§4, §49) ──
      if (schedule.googleCalendarEnabled && gcalConnection?.connected) {
        const googleEventId = await syncOccurrenceToGoogle(uid, gcalConnection, schedule, {
          scheduledStart, status, occurrenceDate: occDate, googleEventId: materialized?.googleEventId || null,
        });
        if (googleEventId && googleEventId !== materialized?.googleEventId) {
          await db.collection("users").doc(uid).collection("scheduleOccurrences").doc(occId).set({
            id: occId, scheduleId: schedule.id, occurrenceDate: occDate,
            googleEventId, status,
          }, { merge: true });
        }
      }
    }
  }

  if (gcalConnection?.syncRequestedAt || gcalConnection?.connected) {
    await markSyncCompleted(uid);
  }
}

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export async function runReminderEngine() {
  console.log(`[reminder-engine] run started at ${new Date().toISOString()}`);

  // Complete any pending Google OAuth code exchanges first, so sync below
  // has a fresh connection to work with.
  await exchangePendingAuthCodes();

  const usersSnap = await db.collection("users").get();
  let processed = 0;
  for (const userDoc of usersSnap.docs) {
    try {
      await processUser(userDoc);
      processed++;
    } catch (err) {
      console.error(`[reminder-engine] failed for user ${userDoc.id}:`, err);
    }
  }

  // Poll Telegram for /link, commands, and inline button callbacks in the
  // same run — see telegram-bot.js header comment for why this is safe
  // and free.
  await runTelegramBotOnce().catch((err) => console.error("[reminder-engine] telegram poll failed:", err));

  console.log(`[reminder-engine] run complete. Users processed: ${processed}/${usersSnap.size}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runReminderEngine().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
