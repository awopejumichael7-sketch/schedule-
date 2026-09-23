import { el, clear } from "./app-dom.utils.js";
import { generateDailyReport, generateWeeklyReport, generateMonthlyReport, generateYearlyReport } from "./app-report.service.js";
import { todayISO } from "./app-date.utils.js";

export async function renderReports(root, user) {
  clear(root);
  const page = el("div", { class: "page reports-page" });
  page.appendChild(el("h1", { text: "Productivity reports" }));

  const tabs = el("div", { class: "view-switch" });
  const body = el("div", { class: "report-body" });
  let active = "daily";

  const tabDefs = [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["yearly", "Yearly"]];
  for (const [key, label] of tabDefs) {
    tabs.appendChild(el("button", { class: `chip ${active === key ? "chip-active" : ""}`, onClick: async () => {
      active = key;
      [...tabs.children].forEach((c) => c.classList.remove("chip-active"));
      tabs.children[tabDefs.findIndex(([k]) => k === key)].classList.add("chip-active");
      await loadReport(key);
    }}, [label]));
  }

  async function loadReport(key) {
    clear(body);
    body.appendChild(el("p", { class: "muted", text: "Loading…" }));
    const today = todayISO(user.timezone);
    let report;
    if (key === "daily") report = await generateDailyReport(today, user.timezone);
    else if (key === "weekly") {
      const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      report = await generateWeeklyReport(d.toISOString().slice(0, 10), user.timezone);
    } else if (key === "monthly") {
      const [y, m] = today.split("-").map(Number);
      report = await generateMonthlyReport(y, m, user.timezone);
    } else {
      report = await generateYearlyReport(Number(today.split("-")[0]), user.timezone);
    }
    clear(body);
    body.appendChild(renderReportSummary(report));
  }

  page.appendChild(tabs);
  page.appendChild(body);
  root.appendChild(page);
  await loadReport("daily");
}

function renderReportSummary(report) {
  const wrap = el("div", { class: "report-summary" });
  if (report.type === "yearly") {
    wrap.appendChild(el("div", { class: "stat-grid" }, [
      statCard("Total scheduled", report.annualTotal),
      statCard("Completed", report.annualCompleted),
      statCard("Completion rate", `${report.annualCompletionRate}%`),
    ]));
    const monthGrid = el("div", { class: "month-grid" });
    for (const m of report.months) {
      monthGrid.appendChild(el("div", { class: "month-cell" }, [
        el("div", { text: new Date(2000, m.month - 1, 1).toLocaleString(undefined, { month: "short" }) }),
        el("div", { class: "muted small", text: `${m.completionRate}%` }),
      ]));
    }
    wrap.appendChild(monthGrid);
    return wrap;
  }

  wrap.appendChild(el("div", { class: "stat-grid" }, [
    statCard("Scheduled", report.total),
    statCard("Completed", report.counts.completed || 0),
    statCard("Missed", report.counts.missed || 0),
    statCard("Completion rate", `${report.completionRate}%`),
  ]));

  if (report.bestDay) wrap.appendChild(el("p", { text: `Best day: ${report.bestDay.date} (${Math.round(report.bestDay.rate * 100)}%)` }));
  if (report.worstDay) wrap.appendChild(el("p", { text: `Toughest day: ${report.worstDay.date} (${Math.round(report.worstDay.rate * 100)}%)` }));
  if (report.mostProductiveCategory) wrap.appendChild(el("p", { text: `Most productive category: ${report.mostProductiveCategory.category}` }));

  const catList = el("div", { class: "category-breakdown" });
  for (const [cat, v] of Object.entries(report.byCategory)) {
    catList.appendChild(el("div", { class: "category-row" }, [
      el("span", { text: cat }),
      el("span", { class: "muted", text: `${v.completed}/${v.total}` }),
    ]));
  }
  wrap.appendChild(catList);
  return wrap;
}

function statCard(label, value) {
  return el("div", { class: "stat-card stat-neutral" }, [
    el("div", { class: "stat-value", text: String(value) }),
    el("div", { class: "stat-label", text: label }),
  ]);
}
