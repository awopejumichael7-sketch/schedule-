import { el, clear } from "./app-dom.utils.js";
import { createSchedule } from "./app-schedule.service.js";
import { validateScheduleInput } from "./app-validation.utils.js";

const WEEKDAYS = [["MO","Mon"],["TU","Tue"],["WE","Wed"],["TH","Thu"],["FR","Fri"],["SA","Sat"],["SU","Sun"]];

export function openScheduleForm({ onSaved } = {}) {
  const overlay = el("div", { class: "modal-overlay", onClick: (e) => { if (e.target === overlay) close(); } });
  function close() { overlay.remove(); }

  const title = el("input", { class: "input", placeholder: "Title (e.g. Study Physics)" });
  const description = el("textarea", { class: "input", placeholder: "Description", rows: "2" });
  const category = el("input", { class: "input", placeholder: "Category (e.g. Study, Work, Church)" });
  const location = el("input", { class: "input", placeholder: "Location (optional)" });
  const startDate = el("input", { class: "input", type: "date" });
  const startTime = el("input", { class: "input", type: "time", value: "09:00" });
  const priority = selectEl(["low", "normal", "high", "urgent"], "normal");
  const color = el("input", { class: "input color-input", type: "color", value: "#5B8DEF" });
  const frequency = selectEl(["once", "daily", "weekly", "monthly", "yearly", "custom"], "once");
  const interval = el("input", { class: "input", type: "number", min: "1", value: "1" });

  const weekdayBoxes = {};
  const weekdayPicker = el("div", { class: "weekday-picker hidden" },
    WEEKDAYS.map(([code, label]) => {
      const cb = el("input", { type: "checkbox", value: code });
      weekdayBoxes[code] = cb;
      return el("label", { class: "weekday-chip" }, [cb, label]);
    })
  );

  const monthDay = el("input", { class: "input hidden", type: "number", min: "1", max: "31", placeholder: "Day of month (1-31)" });

  const endType = selectEl(["never", "onDate", "afterCount"], "never");
  const endDate = el("input", { class: "input hidden", type: "date" });

  const reminderOffsets = el("input", { class: "input", placeholder: "Reminder offsets in minutes, comma-separated (e.g. 1440,60,15,0)", value: "60,15,0" });

  const pushCb = el("input", { type: "checkbox", checked: true });
  const emailCb = el("input", { type: "checkbox", checked: true });
  const telegramCb = el("input", { type: "checkbox" });
  const gcalCb = el("input", { type: "checkbox" });

  frequency.addEventListener("change", () => {
    weekdayPicker.classList.toggle("hidden", frequency.value !== "weekly");
    monthDay.classList.toggle("hidden", frequency.value !== "monthly");
  });
  endType.addEventListener("change", () => {
    endDate.classList.toggle("hidden", endType.value !== "onDate");
  });

  const errorBox = el("p", { class: "form-error" });

  const form = el("form", { class: "schedule-form", onSubmit: async (e) => {
    e.preventDefault();
    errorBox.textContent = "";

    const payload = {
      title: title.value.trim(),
      description: description.value.trim(),
      category: category.value.trim() || "General",
      priority: priority.value,
      color: color.value,
      location: location.value.trim(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      startDate: startDate.value,
      startTime: startTime.value,
      endTime: null,
      durationMinutes: null,
      recurrence: {
        frequency: frequency.value,
        interval: Number(interval.value) || 1,
        byDay: frequency.value === "weekly" ? Object.entries(weekdayBoxes).filter(([, cb]) => cb.checked).map(([code]) => code) : null,
        byMonthDay: frequency.value === "monthly" && monthDay.value ? Number(monthDay.value) : null,
        byMonthPosition: null,
        endType: endType.value,
        endDate: endType.value === "onDate" ? endDate.value : null,
        occurrenceCount: null,
      },
      reminders: reminderOffsets.value.split(",").map((s) => s.trim()).filter(Boolean).map((n) => ({
        offsetMinutes: Number(n),
        channels: [pushCb.checked && "push", emailCb.checked && "email", telegramCb.checked && "telegram", gcalCb.checked && "googleCalendar"].filter(Boolean),
      })),
      googleCalendarEnabled: gcalCb.checked,
      googleCalendarId: null,
      notes: "",
    };

    const errors = validateScheduleInput(payload);
    if (errors.length) { errorBox.textContent = errors.join(" "); return; }

    await createSchedule(payload);
    close();
    onSaved && onSaved();
  }}, [
    el("h2", { text: "Add schedule" }),
    field("Title", title),
    field("Description", description),
    row([field("Category", category), field("Priority", priority)]),
    row([field("Date", startDate), field("Time", startTime)]),
    field("Location", location),
    field("Color", color),
    field("Repeats", frequency),
    row([field("Every", interval)]),
    weekdayPicker,
    monthDay,
    field("Ends", endType),
    endDate,
    field("Reminders (minutes before)", reminderOffsets),
    el("div", { class: "channel-row" }, [
      el("label", {}, [pushCb, " Push"]),
      el("label", {}, [emailCb, " Email"]),
      el("label", {}, [telegramCb, " Telegram"]),
      el("label", {}, [gcalCb, " Google Calendar"]),
    ]),
    errorBox,
    el("div", { class: "form-actions" }, [
      el("button", { class: "btn btn-secondary", type: "button", onClick: close }, ["Cancel"]),
      el("button", { class: "btn btn-primary", type: "submit" }, ["Save schedule"]),
    ]),
  ]);

  overlay.appendChild(el("div", { class: "modal-card" }, [form]));
  document.body.appendChild(overlay);
}

function selectEl(options, defaultVal) {
  const s = el("select", { class: "input" }, options.map((o) => el("option", { value: o, text: o, ...(o === defaultVal ? { selected: "selected" } : {}) })));
  s.value = defaultVal;
  return s;
}
function field(label, input) { return el("div", { class: "field" }, [el("label", { class: "field-label", text: label }), input]); }
function row(fields) { return el("div", { class: "field-row" }, fields); }
