import { el, clear } from "./app-dom.utils.js";
import { db, auth } from "./app-firebase-init.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { IANA_TIMEZONES_SAMPLE } from "./app-date.utils.js";
import { connectGoogleCalendar } from "./app-google-calendar.service.js";
import { requestTelegramLinkCode } from "./app-telegram.service.js";

// §62 — 7-step onboarding with progress.
const STEPS = ["Name", "Timezone", "Notifications", "Google Calendar", "Telegram", "Accountability times", "First schedule"];

export function renderOnboarding(root, user, onComplete) {
  clear(root);
  let step = 0;
  const progress = el("div", { class: "onboarding-progress" });
  const content = el("div", { class: "onboarding-content" });

  function renderProgress() {
    clear(progress);
    STEPS.forEach((label, i) => {
      progress.appendChild(el("div", { class: `onboarding-dot ${i <= step ? "done" : ""}`, title: label }));
    });
  }

  function next() { step = Math.min(step + 1, STEPS.length - 1); renderStep(); }
  function finish() {
    updateDoc(doc(db, "users", auth.currentUser.uid), { onboardingComplete: true, updatedAt: serverTimestamp() });
    onComplete();
  }

  function renderStep() {
    renderProgress();
    clear(content);
    const title = el("h2", { text: STEPS[step] });
    let body;
    if (step === 1) {
      const s = el("select", { class: "input" }, IANA_TIMEZONES_SAMPLE.map((tz) => el("option", { value: tz, text: tz })));
      s.value = user.timezone;
      s.addEventListener("change", () => updateDoc(doc(db, "users", auth.currentUser.uid), { timezone: s.value }));
      body = s;
    } else if (step === 3) {
      body = el("button", { class: "btn btn-secondary", onClick: connectGoogleCalendar }, ["Connect Google Calendar (optional)"]);
    } else if (step === 4) {
      body = el("button", { class: "btn btn-secondary", onClick: async () => {
        const code = await requestTelegramLinkCode();
        alert(`In Telegram, message the SSAS bot: /link ${code}`);
      }}, ["Connect Telegram (optional)"]);
    } else if (step === 5) {
      const t1 = el("input", { class: "input", type: "time", value: "20:45" });
      const t2 = el("input", { class: "input", type: "time", value: "22:15" });
      t1.addEventListener("change", () => updateDoc(doc(db, "users", auth.currentUser.uid), { "accountability.firstCheckTime": t1.value }));
      t2.addEventListener("change", () => updateDoc(doc(db, "users", auth.currentUser.uid), { "accountability.secondCheckTime": t2.value }));
      body = el("div", {}, [el("label", { text: "First check" }), t1, el("label", { text: "Second check" }), t2]);
    } else {
      body = el("p", { class: "muted", text: "You can fine-tune everything later in Settings." });
    }
    content.appendChild(el("div", { class: "onboarding-card" }, [
      title, body,
      el("div", { class: "form-actions" }, [
        step < STEPS.length - 1
          ? el("button", { class: "btn btn-primary", onClick: next }, ["Next"])
          : el("button", { class: "btn btn-primary", onClick: finish }, ["Go to dashboard"]),
        step < STEPS.length - 1 ? el("button", { class: "btn btn-secondary", onClick: finish }, ["Skip onboarding"]) : null,
      ]),
    ]));
  }

  root.appendChild(el("div", { class: "onboarding-shell" }, [progress, content]));
  renderStep();
}
