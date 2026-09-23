import { el, clear } from "./app-dom.utils.js";
import { todayISO, formatFriendlyDate, formatTime12h, greetingForTime } from "./app-date.utils.js";
import { getOccurrencesInWindow, markCompleted, markIncomplete, snoozeOccurrence, skipOccurrence, rescheduleOccurrence } from "./app-schedule.service.js";
import { openScheduleForm } from "./app-schedule-form.component.js";
import { describeRecurrence } from "./app-recurrence.service.js";

export async function renderDashboard(root, user) {
  clear(root);

  const today = todayISO(user.timezone);
  const occurrences = await getOccurrencesInWindow(today, today, user.timezone);

  const completed = occurrences.filter((o) => o.status === "completed").length;
  const missed = occurrences.filter((o) => o.status === "missed").length;
  const pending = occurrences.length - completed - missed - occurrences.filter((o) => ["skipped", "cancelled"].includes(o.status)).length;
  const pct = occurrences.length ? Math.round((completed / occurrences.length) * 100) : 0;

  const nextUp = occurrences.find((o) => new Date(o.scheduledStart) > new Date() && !["completed", "skipped", "cancelled"].includes(o.status));

  const header = el("div", { class: "dashboard-header" }, [
    el("div", {}, [
      el("h1", { class: "greeting", text: `${greetingForTime(new Date().getHours())}, ${user.name.split(" ")[0]}` }),
      el("p", { class: "muted", text: formatFriendlyDate(today) }),
    ]),
    el("button", { class: "btn btn-primary fab-inline", onClick: () => openScheduleForm({ onSaved: () => renderDashboard(root, user) }) }, ["+ Add schedule"]),
  ]);

  const statCards = el("div", { class: "stat-grid" }, [
    statCard("Completed", completed, "stat-good"),
    statCard("Pending", pending, "stat-warn"),
    statCard("Missed", missed, "stat-bad"),
    statCard("Completion", `${pct}%`, "stat-neutral"),
  ]);

  const progressBar = el("div", { class: "progress-track" }, [
    el("div", { class: "progress-fill", style: `width:${pct}%` }),
  ]);

  const nextUpCard = nextUp
    ? el("div", { class: "next-up-card" }, [
        el("span", { class: "eyebrow", text: "Next up" }),
        el("h3", { text: nextUp.schedule.title }),
        el("p", { class: "muted", text: `${formatTime12h(nextUp.schedule.startTime)} · ${describeRecurrence(nextUp.schedule.recurrence)}` }),
      ])
    : el("div", { class: "next-up-card empty" }, [el("p", { class: "muted", text: "Nothing else scheduled today." })]);

  const list = el("div", { class: "occurrence-list" });
  if (!occurrences.length) {
    list.appendChild(el("div", { class: "empty-state" }, [
      el("p", { text: "No activities scheduled today." }),
      el("button", { class: "btn btn-secondary", onClick: () => openScheduleForm({ onSaved: () => renderDashboard(root, user) }) }, ["Create your first schedule"]),
    ]));
  } else {
    for (const occ of occurrences) list.appendChild(occurrenceRow(occ, () => renderDashboard(root, user)));
  }

  root.appendChild(el("div", { class: "page dashboard" }, [
    header, statCards, progressBar, nextUpCard,
    el("h2", { class: "section-title", text: "Today's activities" }), list,
  ]));
}

function statCard(label, value, cls) {
  return el("div", { class: `stat-card ${cls}` }, [
    el("div", { class: "stat-value", text: String(value) }),
    el("div", { class: "stat-label", text: label }),
  ]);
}

function occurrenceRow(occ, refresh) {
  const statusIcon = { completed: "✓", pending: "?", missed: "✗", skipped: "⤼", scheduled: "•", rescheduled: "↻", snoozed: "⏰", in_progress: "…", cancelled: "–" }[occ.status] || "•";

  const row = el("div", { class: `occ-row occ-${occ.status} priority-${occ.schedule.priority}` }, [
    el("div", { class: "occ-status-icon", text: statusIcon }),
    el("div", { class: "occ-main" }, [
      el("div", { class: "occ-title", text: occ.schedule.title }),
      el("div", { class: "occ-meta muted", text: `${formatTime12h(occ.schedule.startTime)} · ${occ.schedule.category || "Uncategorized"}` }),
    ]),
    el("div", { class: "occ-actions" }, [
      occ.status !== "completed" ? el("button", { class: "icon-btn", title: "Mark complete", onClick: async () => { await markCompleted(occ.scheduleId, occ.occurrenceDate); refresh(); } }, ["✓"]) : null,
      el("button", { class: "icon-btn", title: "Snooze 15 min", onClick: async () => { await snoozeOccurrence(occ.scheduleId, occ.occurrenceDate, 15); refresh(); } }, ["⏰"]),
      el("button", { class: "icon-btn", title: "Skip", onClick: async () => { await skipOccurrence(occ.scheduleId, occ.occurrenceDate); refresh(); } }, ["⤼"]),
      el("button", { class: "icon-btn", title: "Not completed", onClick: async () => {
        const reason = prompt("Why wasn't this completed? (optional)") || "";
        await markIncomplete(occ.scheduleId, occ.occurrenceDate, reason);
        refresh();
      }}, ["✗"]),
    ]),
  ]);
  return row;
}
