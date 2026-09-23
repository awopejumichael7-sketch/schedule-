// service-worker.js — App-shell caching + offline fallback (§35, §36).
//
// Strategy: cache-first for the static app shell (HTML/CSS/JS/icons),
// network-first for anything else (Firestore's own SDK handles its
// offline queue separately via IndexedDB persistence — this worker only
// needs to keep the UI itself loadable offline).

const CACHE_NAME = "ssas-shell-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/styles.css",
  "/app-main.js",
  "/app-firebase-init.js",
  "/app-firebase-config.js",
  "/app-auth.service.js",
  "/app-schedule.service.js",
  "/app-recurrence.service.js",
  "/app-report.service.js",
  "/app-export.service.js",
  "/app-notification-prefs.service.js",
  "/app-google-calendar.service.js",
  "/app-telegram.service.js",
  "/app-login.page.js",
  "/app-dashboard.page.js",
  "/app-calendar.page.js",
  "/app-reports.page.js",
  "/app-settings.page.js",
  "/app-admin.page.js",
  "/app-cost-safety.page.js",
  "/app-onboarding.page.js",
  "/app-schedule-form.component.js",
  "/app-dom.utils.js",
  "/app-date.utils.js",
  "/app-validation.utils.js",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept Firebase/Google/Telegram API calls — those need real
  // network semantics (auth headers, streaming), not the cache.
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("google.com") ||
    url.hostname.includes("gstatic.com")
  ) {
    return;
  }

  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("/index.html"));
    })
  );
});

// Web Push (§10) — displays a notification when FCM delivers one while the
// app is in the background. Click focuses/opens the app to the relevant
// route.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: "SSAS", body: event.data.text() }; }
  const title = payload.notification?.title || payload.title || "SSAS Reminder";
  const body = payload.notification?.body || payload.body || "";
  const route = payload.data?.route || "/dashboard";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { route },
      tag: payload.data?.occurrenceId || undefined,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = event.notification.data?.route || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsArr) => {
      const existing = clientsArr.find((c) => "focus" in c);
      if (existing) { existing.navigate(`/index.html#${route}`); return existing.focus(); }
      return self.clients.openWindow(`/index.html#${route}`);
    })
  );
});
