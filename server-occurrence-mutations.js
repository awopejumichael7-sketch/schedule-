// occurrence-mutations.js — server-side (Admin SDK) equivalents of
// app-schedule.service.js's status mutators. Kept as a
// separate small module so both reminder-engine.js, accountability-
// engine.js, and telegram-bot.js share one implementation (§18).

import { db, FieldValue } from "./server-firebase-admin-init.js";

function occurrenceId(scheduleId, isoDate) {
  return `${scheduleId}_${isoDate}`;
}

async function setStatus(uid, occurrenceIdOrCompound, status, extra = {}) {
  // Accept either a bare occurrenceId ("sched123_2026-08-10") or a
  // "scheduleId:isoDate" pair for callers that have them separately.
  const id = occurrenceIdOrCompound.includes(":")
    ? occurrenceId(...occurrenceIdOrCompound.split(":"))
    : occurrenceIdOrCompound;
  const [scheduleId, occurrenceDate] = id.split("_");
  const ref = db.collection("users").doc(uid).collection("scheduleOccurrences").doc(id);
  const base = {
    id, scheduleId, occurrenceDate, status,
    updatedAt: FieldValue.serverTimestamp(),
    ...extra,
  };
  if (status === "completed") base.completedAt = FieldValue.serverTimestamp();
  await ref.set(base, { merge: true });
}

export const markCompletedServerSide = (uid, occId) => setStatus(uid, occId, "completed");
export const skipOccurrenceServerSide = (uid, occId) => setStatus(uid, occId, "skipped");
export const snoozeOccurrenceServerSide = (uid, occId, minutes) =>
  setStatus(uid, occId, "snoozed", {
    snoozedUntil: new Date(Date.now() + minutes * 60000),
  });
export const markMissedServerSide = (uid, occId) => setStatus(uid, occId, "missed");
