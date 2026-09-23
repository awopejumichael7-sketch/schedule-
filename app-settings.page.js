import { el, clear } from "./app-dom.utils.js";
import { db, auth } from "./app-firebase-init.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getNotificationPrefs, updateNotificationPrefs, updateAccountabilitySettings } from "./app-notification-prefs.service.js";
import { connectGoogleCalendar, watchGoogleCalendarStatus, disconnectGoogleCalendar, requestSyncNow } from "./app-google-calendar.service.js";
import { requestTelegramLinkCode, watchTelegramStatus, disconnectTelegram, sendTestTelegramNotification } from "./app-telegram.service.js";
import { exportSchedulesJSON, exportSchedulesCSV, exportCompletionHistoryJSON, downloadFile, deleteAllMyData } from "./app-export.service.js";
import { IANA_TIMEZONES_SAMPLE } from "./app-date.utils.js";
import { logout } from "./app-auth.service.js";

export async function renderSettings(root, user) {
  clear(root);
  const prefs = await getNotificationPrefs();
  const page = el("div", { class: "page settings-page" });
  page.appendChild(el("h1", { text: "Settings" }));

  page.appendChild(section("Profile", [
    field("Name", el("input", { class: "input", value: user.name, onChange: (e) => updateUser({ name: e.target.value }) })),
    field("Timezone", timezoneSelect(user.timezone, (tz) => updateUser({ timezone: tz }))),
    field("Theme", themeSelect(user.theme, (t) => { updateUser({ theme: t }); applyTheme(t); })),
  ]));

  page.appendChild(section("Notification channels", [
    toggleRow("Push notifications", prefs.push, (v) => updateNotificationPrefs({ push: v })),
    toggleRow("Email", prefs.email, (v) => updateNotificationPrefs({ email: v })),
    toggleRow("Telegram", prefs.telegram, (v) => updateNotificationPrefs({ telegram: v })),
    toggleRow("Google Calendar", prefs.googleCalendar, (v) => updateNotificationPrefs({ googleCalendar: v })),
  ]));

  page.appendChild(section("Email digests", [
    toggleRow("Daily digest", prefs.dailyEmailDigest, (v) => updateNotificationPrefs({ dailyEmailDigest: v })),
    toggleRow("Weekly digest", prefs.weeklyEmailDigest, (v) => updateNotificationPrefs({ weeklyEmailDigest: v })),
    toggleRow("Monthly digest", prefs.monthlyEmailDigest, (v) => updateNotificationPrefs({ monthlyEmailDigest: v })),
  ]));

  page.appendChild(section("Accountability check-ins", [
    field("First check time", el("input", { class: "input", type: "time", value: user.accountability.firstCheckTime, onChange: (e) => updateAccountabilitySettings({ ...user.accountability, firstCheckTime: e.target.value }) })),
    field("Second check time", el("input", { class: "input", type: "time", value: user.accountability.secondCheckTime, onChange: (e) => updateAccountabilitySettings({ ...user.accountability, secondCheckTime: e.target.value }) })),
    toggleRow("First check enabled", user.accountability.firstCheckEnabled, (v) => updateAccountabilitySettings({ ...user.accountability, firstCheckEnabled: v })),
    toggleRow("Second check enabled", user.accountability.secondCheckEnabled, (v) => updateAccountabilitySettings({ ...user.accountability, secondCheckEnabled: v })),
  ]));

  page.appendChild(googleCalendarSection());
  page.appendChild(telegramSection());

  page.appendChild(section("Data export", [
    el("button", { class: "btn btn-secondary", onClick: async () => downloadFile("ssas-schedules.json", await exportSchedulesJSON(), "application/json") }, ["Export schedules (JSON)"]),
    el("button", { class: "btn btn-secondary", onClick: async () => downloadFile("ssas-schedules.csv", await exportSchedulesCSV(), "text/csv") }, ["Export schedules (CSV)"]),
    el("button", { class: "btn btn-secondary", onClick: async () => downloadFile("ssas-history.json", await exportCompletionHistoryJSON(), "application/json") }, ["Export completion history (JSON)"]),
  ]));

  page.appendChild(section("Privacy & account", [
    el("button", { class: "btn btn-danger", onClick: async () => {
      if (!confirm("This permanently deletes your SSAS account and all your schedules. This cannot be undone. Continue?")) return;
      const removeGcal = confirm("Also remove SSAS-created events from your Google Calendar?");
      await deleteAllMyData(removeGcal);
    }}, ["Delete my account and all data"]),
    el("button", { class: "btn btn-secondary", onClick: () => logout() }, ["Sign out"]),
  ]));

  root.appendChild(page);
}

function updateUser(patch) {
  return updateDoc(doc(db, "users", auth.currentUser.uid), { ...patch, updatedAt: serverTimestamp() });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function section(title, children) {
  return el("section", { class: "settings-section" }, [el("h2", { text: title }), ...children]);
}
function field(label, input) { return el("div", { class: "field" }, [el("label", { class: "field-label", text: label }), input]); }
function toggleRow(label, checked, onChange) {
  const cb = el("input", { type: "checkbox", ...(checked ? { checked: "checked" } : {}) });
  cb.checked = checked;
  cb.addEventListener("change", () => onChange(cb.checked));
  return el("label", { class: "toggle-row" }, [cb, label]);
}
function timezoneSelect(current, onChange) {
  const s = el("select", { class: "input" }, IANA_TIMEZONES_SAMPLE.map((tz) => el("option", { value: tz, text: tz })));
  s.value = current;
  s.addEventListener("change", () => onChange(s.value));
  return s;
}
function themeSelect(current, onChange) {
  const s = el("select", { class: "input" }, ["system", "light", "dark"].map((t) => el("option", { value: t, text: t })));
  s.value = current;
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

function googleCalendarSection() {
  const status = el("p", { class: "muted", text: "Loading status…" });
  const actions = el("div", { class: "button-row" });
  watchGoogleCalendarStatus((data) => {
    if (!data || !data.connected) {
      status.textContent = "Not connected.";
      clear(actions);
      actions.appendChild(el("button", { class: "btn btn-secondary", onClick: connectGoogleCalendar }, ["Connect Google Calendar"]));
    } else {
      status.textContent = `Connected as ${data.googleAccountEmail || ""}. Status: ${data.syncStatus}. Last synced: ${data.lastSyncedAt ? new Date(data.lastSyncedAt.toDate()).toLocaleString() : "never"}.`;
      clear(actions);
      actions.appendChild(el("button", { class: "btn btn-secondary", onClick: requestSyncNow }, ["Sync now"]));
      actions.appendChild(el("button", { class: "btn btn-danger", onClick: disconnectGoogleCalendar }, ["Disconnect"]));
    }
  });
  return section("Google Calendar", [status, actions]);
}

function telegramSection() {
  const status = el("p", { class: "muted", text: "Loading status…" });
  const actions = el("div", { class: "button-row" });
  watchTelegramStatus((data) => {
    if (!data || !data.linked) {
      status.textContent = "Not connected.";
      clear(actions);
      actions.appendChild(el("button", { class: "btn btn-secondary", onClick: async () => {
        const code = await requestTelegramLinkCode();
        alert(`Open Telegram, start the SSAS bot, and send:\n\n/link ${code}\n\nThis code expires in 10 minutes.`);
      }}, ["Connect Telegram"]));
    } else {
      status.textContent = "Connected.";
      clear(actions);
      actions.appendChild(el("button", { class: "btn btn-secondary", onClick: sendTestTelegramNotification }, ["Send test notification"]));
      actions.appendChild(el("button", { class: "btn btn-danger", onClick: disconnectTelegram }, ["Disconnect"]));
    }
  });
  return section("Telegram", [status, actions]);
}
