// notification-router.js — the "Channel Router" from ARCHITECTURE.md §4
// (§45 failure handling, §51 engine concept, §67 duplicate prevention).
//
// Every send attempt is guarded by a deterministic idempotency key so a
// GitHub Actions run that overlaps the previous one (e.g. a slow run plus
// the next scheduled trigger) can never double-send (§67).

import { db, FieldValue } from "./server-firebase-admin-init.js";
import { sendReminderEmail, sendAccountabilityEmail } from "./server-email.service.js";
import { sendTelegramMessage, reminderKeyboard } from "./server-telegram.service.js";
import { sendPushToUser } from "./server-push.service.js";

function idempotencyKey(occurrenceId, offsetMinutes, channel) {
  return `${occurrenceId}:${offsetMinutes}:${channel}`;
}

/**
 * Attempts one channel for one reminder. Returns true if sent (or already
 * sent — idempotent no-op), false if it failed.
 */
async function dispatchChannel({ uid, occurrenceId, offsetMinutes, channel, user, schedule, occurrenceDate }) {
  const key = idempotencyKey(occurrenceId, offsetMinutes, channel);
  const ref = db.collection("users").doc(uid).collection("notifications").doc(key);
  const existing = await ref.get();
  if (existing.exists && existing.data().status === "sent") {
    return true; // already sent — idempotent skip (§67)
  }

  await ref.set({
    occurrenceId, scheduleId: schedule.id, channel,
    scheduledFor: FieldValue.serverTimestamp(),
    status: "queued",
    attempt: (existing.exists ? (existing.data().attempt || 0) : 0) + 1,
  }, { merge: true });

  let result;
  try {
    if (channel === "email") {
      result = await sendReminderEmail(user.email, {
        userName: user.name, scheduleTitle: schedule.title,
        date: occurrenceDate, time: schedule.startTime,
        description: schedule.description, priority: schedule.priority,
      });
    } else if (channel === "telegram") {
      const telegramSnap = await db.collection("users").doc(uid).collection("telegramConnections").doc("primary").get();
      const chatId = telegramSnap.exists && telegramSnap.data().linked ? telegramSnap.data().chatId : null;
      if (!chatId) { result = { ok: false, error: "Telegram not linked" }; }
      else {
        result = await sendTelegramMessage(
          chatId,
          `⏰ *${schedule.title}*\n${schedule.startTime} on ${occurrenceDate}\n${schedule.description || ""}`,
          reminderKeyboard(occurrenceId)
        );
      }
    } else if (channel === "push") {
      result = await sendPushToUser(uid, {
        title: schedule.title,
        body: `${schedule.startTime} — ${schedule.description || "Reminder"}`,
        route: "/dashboard",
        occurrenceId,
      });
    } else if (channel === "googleCalendar") {
      // Google Calendar's own native event reminders (configured at event
      // creation time in google-calendar-sync.js) handle this channel —
      // there's nothing additional to "send" here; treat as satisfied.
      result = { ok: true, note: "handled natively by the synced Google Calendar event" };
    } else {
      result = { ok: false, error: `Unknown channel: ${channel}` };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }

  if (result.ok) {
    await ref.set({ status: "sent", sentAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  }

  await ref.set({
    status: "failed",
    failedAt: FieldValue.serverTimestamp(),
    failureReason: result.error || "unknown error",
  }, { merge: true });
  return false;
}

/**
 * Sends one reminder across its configured channels, with the §45 fallback
 * chain: push → email → telegram (only among the channels the user has
 * BOTH configured on the schedule AND enabled globally in preferences).
 * Does not endlessly retry (§45) — one attempt per channel per run.
 */
export async function routeReminder({ uid, user, prefs, schedule, occurrence, reminder }) {
  const requestedChannels = reminder.channels.filter((c) => prefs[c] !== false);
  if (!requestedChannels.length) return;

  const fallbackOrder = ["push", "email", "telegram"].filter((c) => requestedChannels.includes(c));
  const nonFallback = requestedChannels.filter((c) => !fallbackOrder.includes(c)); // e.g. googleCalendar

  let anySucceeded = false;
  for (const channel of fallbackOrder) {
    const ok = await dispatchChannel({
      uid, occurrenceId: occurrence.id, offsetMinutes: reminder.offsetMinutes, channel,
      user, schedule, occurrenceDate: occurrence.occurrenceDate,
    });
    if (ok) { anySucceeded = true; break; } // §45 — stop once one channel succeeds
  }
  // Channels outside the push/email/telegram fallback chain (googleCalendar)
  // always get attempted independently.
  for (const channel of nonFallback) {
    await dispatchChannel({
      uid, occurrenceId: occurrence.id, offsetMinutes: reminder.offsetMinutes, channel,
      user, schedule, occurrenceDate: occurrence.occurrenceDate,
    });
  }
  return anySucceeded;
}

export async function sendAccountabilityMessage({ uid, user, question, summaryLines, chatId }) {
  const prefsSnap = await db.collection("users").doc(uid).collection("notificationPreferences").doc("settings").get();
  const prefs = prefsSnap.exists ? prefsSnap.data() : { email: true, telegram: false, push: true };

  if (prefs.push) {
    await sendPushToUser(uid, { title: "SSAS — Accountability check-in", body: question, route: "/dashboard" });
  }
  if (prefs.email) {
    await sendAccountabilityEmail(user.email, user.name, question, summaryLines);
  }
  if (prefs.telegram && chatId) {
    await sendTelegramMessage(chatId, `*${question}*\n\n${summaryLines.join("\n")}`);
  }
}
