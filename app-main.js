import { auth } from "./app-firebase-init.js";
import { onAuthChange, getUserProfile } from "./app-auth.service.js";
import { renderLogin } from "./app-login.page.js";
import { renderDashboard } from "./app-dashboard.page.js";
import { renderCalendar } from "./app-calendar.page.js";
import { renderReports } from "./app-reports.page.js";
import { renderSettings } from "./app-settings.page.js";
import { renderAdmin } from "./app-admin.page.js";
import { renderCostSafety } from "./app-cost-safety.page.js";
import { renderOnboarding } from "./app-onboarding.page.js";
import { el, clear } from "./app-dom.utils.js";

const appRoot = document.getElementById("app");
const NAV_ITEMS = [
  ["dashboard", "Dashboard", "🏠"],
  ["calendar", "Calendar", "📅"],
  ["reports", "Reports", "📊"],
  ["settings", "Settings", "⚙️"],
];

let currentUser = null;
let currentRoute = "dashboard";

function routeFromHash() {
  return (location.hash.replace("#/", "") || "dashboard").split("?")[0];
}

async function renderShell() {
  clear(appRoot);
  if (!currentUser) { renderLogin(appRoot); return; }

  const profile = await getUserProfile(currentUser.uid);
  if (!profile) return; // doc still being created
  document.documentElement.dataset.theme = profile.theme || "system";

  if (profile.disabled) {
    appRoot.appendChild(el("div", { class: "disabled-screen" }, [
      el("h2", { text: "Account disabled" }),
      el("p", { text: "Your account has been disabled by an administrator. Contact support if you believe this is a mistake." }),
    ]));
    return;
  }

  if (!profile.onboardingComplete) {
    renderOnboarding(appRoot, profile, () => renderShell());
    return;
  }

  const shell = el("div", { class: "app-shell" });
  const sidebar = el("nav", { class: "sidebar" }, [
    el("div", { class: "brand", text: "SSAS" }),
    ...NAV_ITEMS.map(([route, label, icon]) =>
      navLink(route, label, icon)
    ),
    profile.role === "ADMIN" ? navLink("admin", "Admin", "🛡️") : null,
    navLink("cost-safety", "Cost safety", "💸"),
  ]);
  const main = el("main", { class: "main-content" });
  const bottomNav = el("nav", { class: "bottom-nav" }, NAV_ITEMS.map(([route, label, icon]) => navLink(route, label, icon, true)));

  shell.appendChild(sidebar);
  shell.appendChild(main);
  appRoot.appendChild(shell);
  appRoot.appendChild(bottomNav);

  await renderRoute(main, profile);
}

function navLink(route, label, icon, compact) {
  const a = el("a", { href: `#/${route}`, class: `nav-link ${currentRoute === route ? "nav-active" : ""}` }, [
    el("span", { class: "nav-icon", text: icon }),
    compact ? null : el("span", { class: "nav-label", text: label }),
  ]);
  return a;
}

async function renderRoute(main, profile) {
  currentRoute = routeFromHash();
  clear(main);
  if (currentRoute === "dashboard") return renderDashboard(main, profile);
  if (currentRoute === "calendar") return renderCalendar(main, profile);
  if (currentRoute === "reports") return renderReports(main, profile);
  if (currentRoute === "settings") return renderSettings(main, profile);
  if (currentRoute === "cost-safety") return renderCostSafety(main);
  if (currentRoute === "admin") {
    if (profile.role !== "ADMIN") { location.hash = "#/dashboard"; return; }
    return renderAdmin(main, profile);
  }
  return renderDashboard(main, profile);
}

window.addEventListener("hashchange", renderShell);

onAuthChange((user) => {
  currentUser = user;
  renderShell();
});

// Register the service worker for offline support & installability (§35, §36).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((err) => console.warn("SW registration failed", err));
  });
}
