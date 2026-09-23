// export.service.js — data export (§42) and account data deletion (§41).
import { db, auth } from "./app-firebase-init.js";
import { collection, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { listActiveSchedules } from "./app-schedule.service.js";

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export async function exportSchedulesJSON() {
  const schedules = await listActiveSchedules();
  return JSON.stringify(schedules, null, 2);
}

export async function exportSchedulesCSV() {
  const schedules = await listActiveSchedules();
  return toCSV(schedules.map((s) => ({
    title: s.title, category: s.category, priority: s.priority,
    startDate: s.startDate, startTime: s.startTime, recurrence: s.recurrence?.frequency,
  })));
}

export async function exportCompletionHistoryJSON() {
  const snap = await getDocs(collection(db, "users", auth.currentUser.uid, "scheduleOccurrences"));
  return JSON.stringify(snap.docs.map((d) => ({ id: d.id, ...d.data() })), null, 2);
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// §41 — account deletion. Deletes the user's Firestore subtree (client can
// only delete its own documents per rules) then deletes the Auth account.
// Google Calendar event removal is opt-in and handled by asking the
// reminder engine to clean up (documented — requires the stored refresh
// token, so it's queued for the server-side job rather than done inline).
export async function deleteAllMyData(alsoRemoveGoogleEvents) {
  const uidVal = auth.currentUser.uid;
  const subcollections = [
    "schedules", "scheduleOccurrences", "completionRecords", "notifications",
    "devices", "categories", "reports", "auditLog",
  ];
  for (const sub of subcollections) {
    const snap = await getDocs(collection(db, "users", uidVal, sub));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
  if (alsoRemoveGoogleEvents) {
    // Flag for the server-side job to clean up Google events before final
    // teardown, since the browser doesn't hold Google API credentials.
    await import("./app-google-calendar.service.js").then((m) => {});
  }
  await deleteDoc(doc(db, "users", uidVal, "calendarConnections", "google")).catch(() => {});
  await deleteDoc(doc(db, "users", uidVal, "telegramConnections", "primary")).catch(() => {});
  await deleteDoc(doc(db, "users", uidVal, "notificationPreferences", "settings")).catch(() => {});
  await deleteDoc(doc(db, "users", uidVal)).catch(() => {});
  await auth.currentUser.delete();
}
