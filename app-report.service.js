// report.service.js — daily/weekly/monthly/yearly productivity reports (§22, §26-30).
import { getOccurrencesInWindow } from "./app-schedule.service.js";
import { db, auth } from "./app-firebase-init.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function isoDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const c = new Date(d); c.setUTCDate(c.getUTCDate() + n); return c; }

function summarize(occurrences) {
  const counts = { scheduled: 0, completed: 0, pending: 0, missed: 0, skipped: 0, rescheduled: 0, snoozed: 0, cancelled: 0, in_progress: 0 };
  const byCategory = {};
  const byDate = {};
  for (const occ of occurrences) {
    counts[occ.status] = (counts[occ.status] || 0) + 1;
    const cat = occ.schedule?.category || "Uncategorized";
    byCategory[cat] = byCategory[cat] || { total: 0, completed: 0 };
    byCategory[cat].total++;
    if (occ.status === "completed") byCategory[cat].completed++;
    byDate[occ.occurrenceDate] = byDate[occ.occurrenceDate] || { total: 0, completed: 0 };
    byDate[occ.occurrenceDate].total++;
    if (occ.status === "completed") byDate[occ.occurrenceDate].completed++;
  }
  const total = occurrences.length;
  const completionRate = total ? Math.round((counts.completed / total) * 100) : 0;

  let bestDay = null, worstDay = null;
  for (const [date, v] of Object.entries(byDate)) {
    const rate = v.total ? v.completed / v.total : 0;
    if (!bestDay || rate > bestDay.rate) bestDay = { date, rate };
    if (!worstDay || rate < worstDay.rate) worstDay = { date, rate };
  }

  let mostProductiveCategory = null;
  for (const [cat, v] of Object.entries(byCategory)) {
    const rate = v.total ? v.completed / v.total : 0;
    if (!mostProductiveCategory || rate > mostProductiveCategory.rate) mostProductiveCategory = { category: cat, rate };
  }

  return { total, counts, completionRate, byCategory, byDate, bestDay, worstDay, mostProductiveCategory };
}

export async function generateDailyReport(dateISO, timezone) {
  const occurrences = await getOccurrencesInWindow(dateISO, dateISO, timezone);
  const report = { type: "daily", date: dateISO, ...summarize(occurrences) };
  await cacheReport(`daily_${dateISO}`, report);
  return report;
}

export async function generateWeeklyReport(weekStartISO, timezone) {
  const start = new Date(weekStartISO + "T00:00:00Z");
  const end = addDays(start, 6);
  const occurrences = await getOccurrencesInWindow(weekStartISO, isoDate(end), timezone);
  const report = { type: "weekly", weekStart: weekStartISO, weekEnd: isoDate(end), ...summarize(occurrences) };
  await cacheReport(`weekly_${weekStartISO}`, report);
  return report;
}

export async function generateMonthlyReport(year, month, timezone) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const occurrences = await getOccurrencesInWindow(start, end, timezone);
  const report = { type: "monthly", year, month, ...summarize(occurrences) };
  await cacheReport(`monthly_${year}-${String(month).padStart(2, "0")}`, report);
  return report;
}

export async function generateYearlyReport(year, timezone) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    months.push(await generateMonthlyReport(year, m, timezone));
  }
  const totalCompleted = months.reduce((s, m) => s + m.counts.completed, 0);
  const totalScheduled = months.reduce((s, m) => s + m.total, 0);
  const report = {
    type: "yearly", year, months,
    annualTotal: totalScheduled,
    annualCompleted: totalCompleted,
    annualCompletionRate: totalScheduled ? Math.round((totalCompleted / totalScheduled) * 100) : 0,
  };
  await cacheReport(`yearly_${year}`, report);
  return report;
}

async function cacheReport(reportId, data) {
  await setDoc(doc(db, "users", auth.currentUser.uid, "reports", reportId), {
    ...data, generatedAt: serverTimestamp(),
  });
}

// §30 — optional streaks, off by default in UI, computed client-side only.
export function computeStreak(dailyStatusesNewestFirst) {
  let streak = 0;
  for (const dayComplete of dailyStatusesNewestFirst) {
    if (dayComplete) streak++; else break;
  }
  return streak;
}
