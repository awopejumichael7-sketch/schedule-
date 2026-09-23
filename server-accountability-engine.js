// accountability-engine.js
//
// §11 (first check), §12 (second check), §13 (custom times), §14 (per-user
// timezone), §26 (daily summary). Invoked every 5 minutes by
// .github/workflows/accountability-scheduler.yml.
//
// Because every user can have a DIFFERENT local check-in time AND a
// different timezone, this engine can't just "run once at 8:45 PM server
// time" — it evaluates, for each user, whether THEIR local clock is
// currently within the 5-minute window containing their configured check
// time, using their configured timezone. A per-user, per-day idempotency
// document prevents sending the same day's check-in twice even if the
// job overlaps runs.

import { db, FieldValue } from "./server-firebase-admin-init.js";
import { sendAccountabilityMessage } from "./server-notification-router.js";
import { expandOccurrences } from "./app-recurrence.service.js";

const WINDOW_MINUTES = 5; // matches the GitHub Actions cron interval

function localNowParts(timezone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}` };
}

function minutesSinceMidnight(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isWithinWindow(nowHHMM, targetHHMM) {
  const diff = Math.abs(minutesSinceMidnight(nowHHMM) - minutesSinceMidnight(targetHHMM));
  return diff <= WINDOW_MINUTES;
}

async function alreadySent(uid, checkKind, dateISO) {
  const ref = db.collection("users").doc(uid).collection("notifications").doc(`accountability_${checkKind}_${dateISO}`);
  const snap = await ref.get();
  return { ref, sent: snap.exists && snap.data().status === "sent" };
}

async function todaysOccurrenceSummary(uid, user, dateISO) {
  const schedulesSnap = await db.collection("users").doc(uid).collection("schedules").where("status", "==", "active").get();
  const schedules = schedulesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const materializedSnap = await db.collection("users").doc(uid).collection("scheduleOccurrences")
    .where("occurrenceDate", "==", dateISO).get();
  const materializedById = new Map(materializedSnap.docs.map((d) => [d.id, d.data()]));

  const items = [];
  for (const schedule of schedules) {
    const dates = expandOccurrences(schedule, dateISO, dateISO);
    if (!dates.length) continue;
    const occId = `${schedule.id}_${dateISO}`;
    const status = materializedById.get(occId)?.status || "scheduled";
    items.push({ title: schedule.title, status });
  }

  const completed = items.filter((i) => i.status === "completed").length;
  const pending = items.filter((i) => !["completed", "skipped", "cancelled"].includes(i.status)).length;

  const icon = { completed: "✓", missed: "✗", scheduled: "?", pending: "?" };
  const lines = items.map((i) => `${icon[i.status] || "•"} ${i.title}`);

  return { items, completed, pending, total: items.length, lines };
}

async function processUserForCheck(userDoc, checkKind) {
  const uid = userDoc.id;
  const user = userDoc.data();
  if (user.disabled) return;

  const acc = user.accountability || {};
  const enabled = checkKind === "first" ? acc.firstCheckEnabled : acc.secondCheckEnabled;
  if (enabled === false) return;

  const targetTime = checkKind === "first" ? (acc.firstCheckTime || "20:45") : (acc.secondCheckTime || "22:15");
  const timezone = user.timezone || "UTC";
  const { date, hhmm } = localNowParts(timezone);

  if (!isWithinWindow(hhmm, targetTime)) return;

  const { ref, sent } = await alreadySent(uid, checkKind, date);
  if (sent) return; // §67 idempotency — never send twice for the same local day

  const summary = await todaysOccurrenceSummary(uid, user, date);

  let question, lines;
  if (checkKind === "first") {
    question = acc.firstCheckQuestion || "Have you completed today's scheduled activities?";
    lines = ["TODAY'S ACTIVITIES", "", ...summary.lines];
  } else {
    question = acc.secondCheckQuestion || "Final check: have you completed or rescheduled your remaining activities?";
    lines = [
      `You scheduled ${summary.total} activities today.`,
      `Completed: ${summary.completed}`,
      `Pending: ${summary.pending}`,
    ];
  }

  const telegramSnap = await db.collection("users").doc(uid).collection("telegramConnections").doc("primary").get();
  const chatId = telegramSnap.exists && telegramSnap.data().linked ? telegramSnap.data().chatId : null;

  await ref.set({
    channel: "accountability", status: "queued", scheduledFor: FieldValue.serverTimestamp(), attempt: 1,
  }, { merge: true });

  try {
    await sendAccountabilityMessage({ uid, user, question, summaryLines: lines, chatId });
    await ref.set({ status: "sent", sentAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (err) {
    await ref.set({ status: "failed", failedAt: FieldValue.serverTimestamp(), failureReason: err.message }, { merge: true });
  }

  // §26 — cache the daily summary as a report doc so the dashboard/reports
  // page has it immediately without recomputation.
  if (checkKind === "second") {
    await db.collection("users").doc(uid).collection("reports").doc(`daily_${date}`).set({
      type: "daily", date,
      total: summary.total,
      counts: { completed: summary.completed, pending: summary.pending },
      completionRate: summary.total ? Math.round((summary.completed / summary.total) * 100) : 0,
      generatedAt: FieldValue.serverTimestamp(),
      generatedBy: "accountability-engine",
    }, { merge: true });
  }
}

export async function runAccountabilityEngine() {
  console.log(`[accountability-engine] run started at ${new Date().toISOString()}`);
  const usersSnap = await db.collection("users").get();

  for (const userDoc of usersSnap.docs) {
    try {
      await processUserForCheck(userDoc, "first");
      await processUserForCheck(userDoc, "second");
    } catch (err) {
      console.error(`[accountability-engine] failed for user ${userDoc.id}:`, err);
    }
  }

  console.log(`[accountability-engine] run complete. Users evaluated: ${usersSnap.size}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAccountabilityEngine().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
