import { el, clear } from "./app-dom.utils.js";
import { getOccurrencesInWindow } from "./app-schedule.service.js";
import { todayISO, formatTime12h } from "./app-date.utils.js";
import { openScheduleForm } from "./app-schedule-form.component.js";

export async function renderCalendar(root, user) {
  clear(root);
  let view = "month"; // day | week | month | agenda
  let anchor = new Date(todayISO(user.timezone) + "T00:00:00");

  const container = el("div", { class: "page calendar-page" });
  const controls = el("div", { class: "calendar-controls" });
  const body = el("div", { class: "calendar-body" });

  function renderControls() {
    clear(controls);
    controls.appendChild(el("div", { class: "view-switch" },
      ["day", "week", "month", "agenda"].map((v) =>
        el("button", { class: `chip ${view === v ? "chip-active" : ""}`, onClick: () => { view = v; refresh(); } }, [v[0].toUpperCase() + v.slice(1)])
      )
    ));
    controls.appendChild(el("div", { class: "calendar-nav" }, [
      el("button", { class: "icon-btn", onClick: () => { shiftAnchor(-1); refresh(); } }, ["‹"]),
      el("span", { class: "calendar-label", text: anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" }) }),
      el("button", { class: "icon-btn", onClick: () => { shiftAnchor(1); refresh(); } }, ["›"]),
      el("button", { class: "btn btn-primary", onClick: () => openScheduleForm({ onSaved: refresh }) }, ["+ Add"]),
    ]));
  }

  function shiftAnchor(dir) {
    const d = new Date(anchor);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    anchor = d;
  }

  async function refresh() {
    renderControls();
    clear(body);
    const { start, end } = windowFor(view, anchor);
    const occurrences = await getOccurrencesInWindow(iso(start), iso(end), user.timezone);
    body.appendChild(view === "agenda" ? renderAgenda(occurrences) : renderGrid(view, start, end, occurrences));
  }

  container.appendChild(controls);
  container.appendChild(body);
  root.appendChild(container);
  await refresh();
}

function iso(d) { return d.toISOString().slice(0, 10); }

function windowFor(view, anchor) {
  const start = new Date(anchor);
  const end = new Date(anchor);
  if (view === "day") { /* same day */ }
  else if (view === "week") { start.setDate(start.getDate() - start.getDay()); end.setDate(start.getDate() + 6); }
  else { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
  return { start, end };
}

function renderAgenda(occurrences) {
  const list = el("div", { class: "agenda-list" });
  if (!occurrences.length) return el("div", { class: "empty-state" }, [el("p", { text: "Nothing scheduled in this range." })]);
  const byDate = {};
  for (const o of occurrences) (byDate[o.occurrenceDate] = byDate[o.occurrenceDate] || []).push(o);
  for (const [date, items] of Object.entries(byDate).sort()) {
    list.appendChild(el("h3", { class: "agenda-date", text: date }));
    for (const o of items) {
      list.appendChild(el("div", { class: `agenda-item priority-${o.schedule.priority}` }, [
        el("span", { class: "agenda-time", text: formatTime12h(o.schedule.startTime) }),
        el("span", { class: "agenda-title", text: o.schedule.title }),
        el("span", { class: `badge badge-${o.status}`, text: o.status }),
      ]));
    }
  }
  return list;
}

function renderGrid(view, start, end, occurrences) {
  const byDate = {};
  for (const o of occurrences) (byDate[o.occurrenceDate] = byDate[o.occurrenceDate] || []).push(o);

  const grid = el("div", { class: `grid-${view}` });
  const cursor = new Date(start);
  while (cursor <= end) {
    const dateISO = iso(cursor);
    const dayItems = byDate[dateISO] || [];
    grid.appendChild(el("div", { class: "grid-cell" }, [
      el("div", { class: "grid-cell-date", text: String(cursor.getDate()) }),
      el("div", { class: "grid-cell-items" }, dayItems.slice(0, 4).map((o) =>
        el("div", { class: `grid-chip priority-${o.schedule.priority}`, title: o.schedule.title, text: o.schedule.title })
      )),
      dayItems.length > 4 ? el("div", { class: "muted small", text: `+${dayItems.length - 4} more` }) : null,
    ]));
    cursor.setDate(cursor.getDate() + 1);
  }
  return grid;
}
