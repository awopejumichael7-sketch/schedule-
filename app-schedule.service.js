import { db, auth } from "./app-firebase-init.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp, setDoc, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { expandOccurrences, resolveLocalToUTC } from "./app-recurrence.service.js";

function uid() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  return u.uid;
}

// ── Schedule CRUD ─────────────────────────────────────────────
export async function createSchedule(payload) {
  const ref = await addDoc(collection(db, "users", uid(), "schedules"), {
    ...payload,
    status: "active",
    sharedWith: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSchedule(scheduleId, payload) {
  await updateDoc(doc(db, "users", uid(), "schedules", scheduleId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

export async function cancelSchedule(scheduleId) {
  await updateDoc(doc(db, "users", uid(), "schedules", scheduleId), {
    status: "cancelled",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSchedule(scheduleId) {
  await deleteDoc(doc(db, "users", uid(), "schedules", scheduleId));
}

export async function listActiveSchedules() {
  const q = query(collection(db, "users", uid(), "schedules"), where("status", "==", "active"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── Occurrences (materialized only when state diverges — see ARCHITECTURE.md §6) ──

function occurrenceId(scheduleId, isoDate) {
  return `${scheduleId}_${isoDate}`;
}

/**
 * Build the "virtual" occurrence list for a window, overlaying any
 * materialized occurrence documents (which carry real status) on top of
 * the recurrence-engine-generated dates (which default to "scheduled").
 */
export async function getOccurrencesInWindow(windowStartISO, windowEndISO, userTimezone) {
  const schedules = await listActiveSchedules();
  const materializedSnap = await getDocs(
    query(
      collection(db, "users", uid(), "scheduleOccurrences"),
      where("occurrenceDate", ">=", windowStartISO),
      where("occurrenceDate", "<=", windowEndISO)
    )
  );
  const materializedById = new Map(materializedSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));

  const occurrences = [];
  for (const schedule of schedules) {
    const dates = expandOccurrences(schedule, windowStartISO, windowEndISO);
    for (const isoDate of dates) {
      const id = occurrenceId(schedule.id, isoDate);
      if (materializedById.has(id)) {
        occurrences.push({ ...materializedById.get(id), schedule });
      } else {
        occurrences.push({
          id,
          scheduleId: schedule.id,
          occurrenceDate: isoDate,
          scheduledStart: resolveLocalToUTC(
            ...isoDateToCal(isoDate),
            schedule.startTime,
            schedule.timezone || userTimezone
          ),
          status: "scheduled",
          notes: "",
          rescheduleDate: null,
          rescheduleTime: null,
          googleEventId: null,
          schedule,
        });
      }
    }
  }
  occurrences.sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));
  return occurrences;
}

function isoDateToCal(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return [{ y, m, d }];
}

/**
 * Materialize (create-or-update) an occurrence document with a new status.
 * This is how completed/pending/snoozed/rescheduled/skipped/missed states
 * get persisted (§18).
 */
export async function setOccurrenceStatus(scheduleId, isoDate, status, extra = {}) {
  const id = occurrenceId(scheduleId, isoDate);
  const ref = doc(db, "users", uid(), "scheduleOccurrences", id);
  const existing = await getDoc(ref);
  const base = {
    id,
    scheduleId,
    occurrenceDate: isoDate,
    status,
    updatedAt: serverTimestamp(),
    ...extra,
  };
  if (status === "completed") base.completedAt = serverTimestamp();
  if (!existing.exists()) {
    base.createdAt = serverTimestamp();
    base.notes = extra.notes || "";
    base.rescheduleDate = extra.rescheduleDate || null;
    base.rescheduleTime = extra.rescheduleTime || null;
    base.googleEventId = null;
  }
  await setDoc(ref, base, { merge: true });
}

export const markCompleted = (scheduleId, isoDate) => setOccurrenceStatus(scheduleId, isoDate, "completed");
export const markIncomplete = (scheduleId, isoDate, reason) =>
  setOccurrenceStatus(scheduleId, isoDate, "pending", { notes: reason || "" });
export const skipOccurrence = (scheduleId, isoDate) => setOccurrenceStatus(scheduleId, isoDate, "skipped");
export const snoozeOccurrence = (scheduleId, isoDate, minutes) =>
  setOccurrenceStatus(scheduleId, isoDate, "snoozed", {
    snoozedUntil: Timestamp.fromMillis(Date.now() + minutes * 60000),
  });
export const rescheduleOccurrence = (scheduleId, isoDate, newDate, newTime) =>
  setOccurrenceStatus(scheduleId, isoDate, "rescheduled", { rescheduleDate: newDate, rescheduleTime: newTime });
