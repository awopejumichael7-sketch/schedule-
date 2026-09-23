# ARCHITECTURE.md

## 1. Requirements analysis (summary)

SSAS must support many independent users, each with private schedules,
recurring events, multi-channel reminders, two daily "accountability"
check-ins, Google Calendar sync, Telegram, email, offline PWA use, and
reporting — on a genuinely $0 budget with no risk of surprise billing.

The two hardest constraints, in tension with each other:

1. **Scheduled background work** (reminders firing at exact times,
   accountability checks at 8:45 PM / 10:15 PM *per user timezone*) is
   inherently a server-side, time-driven concern.
2. **Zero cost, no billing account.** Firebase's scheduled Cloud Functions,
   Cloud Scheduler, and Cloud Run all require the **Blaze plan**, which
   requires attaching a billing account (even if you never cross into paid
   usage). That violates "no credit card where possible" from the brief.

## 2. Technology decisions and why

| Concern | Choice | Why | Free-tier caveat |
|---|---|---|---|
| Auth | Firebase Authentication | Free, unlimited email/password + Google sign-in on Spark plan | None significant for this scale |
| Database | Cloud Firestore (Spark) | Free 50K reads / 20K writes / 20K deletes per day, 1 GiB storage, native security rules | Shared across ALL users of the project — see `FREE-TIER-LIMITS.md` for how occurrence-generation is capped to avoid burning this |
| Hosting | Firebase Hosting (Spark) or GitHub Pages | Free static hosting, HTTPS by default, no card required | 10 GB storage / 360 MB/day transfer on Firebase Hosting free tier |
| Scheduled jobs | **GitHub Actions scheduled workflows**, NOT Cloud Functions | Cloud Functions on a schedule need Blaze (billing account) even at $0 usage. GitHub Actions gives 2,000 free CI minutes/month with zero billing account required on a free personal account. | Cron granularity is ~5 minutes minimum in practice (GitHub's own scheduler jitter can add extra delay of a few minutes); the engine compensates by treating a reminder as "due" if `now >= scheduledTime` and not yet sent, and by skipping a reminder that's gone stale (see `NOTIFICATIONS.md` §Missed Reminder Recovery) |
| Reminder/accountability compute | Plain Node.js scripts using **firebase-admin** SDK | Admin SDK works with Firestore on the free Spark plan — it's the *scheduled Cloud Functions product* that requires Blaze, not server-side Firestore access itself | Admin SDK calls still count against Firestore's free read/write quota |
| Push notifications | Firebase Cloud Messaging (FCM) via the Web Push protocol | Free, unlimited | Requires HTTPS (satisfied by Firebase Hosting) and a VAPID key (free, self-generated) |
| Email | Gmail SMTP via Nodemailer, sent from the GitHub Actions runner | Free, no billing account | ~500 messages/day per Gmail account (Google's documented consumer limit) — see `FREE-TIER-LIMITS.md` |
| Telegram | Telegram Bot API (long polling or webhook) | Entirely free, no quota billing | Standard Telegram API rate limits (≈30 msg/sec bot-wide) — irrelevant at this scale |
| Calendar sync | Google Calendar API v3, OAuth 2.0, per-user consent | Free within Google's default quota (1,000,000 requests/day per project) | OAuth client registration is free; Google may require "app verification" only if you request sensitive scopes at scale — SSAS requests the minimal `calendar.events` scope, which for a low user-count testing/personal project stays in "testing" mode indefinitely with no verification needed |
| Frontend | Vanilla HTML5/CSS3/ES6 modules + a lightweight in-house router | Avoids a build step, a bundler, and framework licensing/hosting complexity the brief said to avoid unless it "materially improves maintainability" — for this feature set it doesn't | N/A |
| Offline | Service Worker + Cache API + Firestore's built-in offline persistence | Free, standard web platform features | N/A |

## 3. High-level diagram

```
                         ┌─────────────────────────┐
                         │   Browser / PWA (each    │
                         │   user's device)          │
                         │                            │
                         │  Firebase Auth  ───────────┼───► Firebase Authentication
                         │  Firestore SDK  ───────────┼───► Cloud Firestore
                         │  Service Worker (offline)  │
                         │  FCM (push)     ───────────┼───► Firebase Cloud Messaging
                         │  Google Identity Services  │
                         │      OAuth popup  ─────────┼───► Google Calendar API
                         └─────────────────────────┘
                                     ▲
                                     │ reads/writes (per-user, rules-enforced)
                                     ▼
                         ┌─────────────────────────┐
                         │      Cloud Firestore      │
                         │  users/{uid}/...          │
                         └─────────────────────────┘
                                     ▲
                                     │ Admin SDK (service account)
                                     │
     ┌───────────────────────────────────────────────────────────┐
     │            GitHub Actions (free scheduled runner)           │
     │                                                               │
     │  reminder-scheduler.yml  (every 5 min)                        │
     │     → server-reminder-engine.js                              │
     │         → computes due occurrences per user's timezone        │
     │         → notification-router → Push / Email / Telegram /     │
     │                                   Google Calendar               │
     │                                                               │
     │  accountability-scheduler.yml (every 5 min, checks per-user    │
     │                                custom check-in times)          │
     │     → server-accountability-engine.js                        │
     │                                                               │
     │  telegram-bot.js runs as a long-lived process elsewhere OR    │
     │  as a webhook target (see TELEGRAM.md for both options)  │
     └───────────────────────────────────────────────────────────┘
```

## 4. Notification engine concept

```
Schedule → Occurrence → Reminder → Notification Queue → Channel Router
                                                            ├── Push (FCM)
                                                            ├── Email (Gmail SMTP)
                                                            ├── Telegram (Bot API)
                                                            └── Google Calendar (native reminders)
```

Each queued notification carries a deterministic idempotency key:
`{occurrenceId}:{reminderOffsetMinutes}:{channel}`. Before sending, the
engine checks `notifications/{idempotencyKey}` — if it already exists with
status `sent`, it's skipped. This satisfies §51 and §67 (duplicate
prevention) without needing a distributed lock.

## 5. Multi-tenant isolation

All user-owned data lives under `users/{uid}/...` and Firestore Security
Rules enforce `request.auth.uid == uid` on every read/write (see
`firestore.rules` and `SECURITY.md`). There is intentionally
**no top-level collection that all users can query** (§59) — this is what
lets SSAS scale to thousands of users without a redesign: every query is
already scoped to a single user's subtree, so Firestore's per-document
security check stays O(1) regardless of total user count.

## 6. Recurrence & occurrence generation strategy (§17)

SSAS does **not** pre-generate all future occurrences of a recurring
schedule. Instead:

- The `schedules/{scheduleId}` document stores the recurrence *rule*
  (RRULE-like fields: frequency, interval, byDay, byMonthDay, startDate,
  endDate/never).
- `recurrence.service.js` is a pure function library that expands a rule
  into concrete occurrence dates on demand, for a bounded window (default:
  today .. +35 days for the calendar view, today only for the reminder
  engine).
- Only when an occurrence needs *mutable state* (completed, snoozed,
  rescheduled, skipped, notes) does SSAS materialize a real
  `scheduleOccurrences/{occurrenceId}` document, keyed
  `{scheduleId}_{isoDate}`. Untouched future occurrences never become
  documents — this is what keeps Firestore usage inside the free tier even
  with many recurring schedules per user (see `FREE-TIER-LIMITS.md` for the
  math).

## 7. Build phases

This repository was built in the following order (§77); each phase's code
is complete and cross-referenced below:

1. Architecture & docs — this file, `DATABASE.md`, `SECURITY.md`
2. Authentication — `app-auth.service.js`, `app-login.page.js`
3. Database & rules — `firestore.rules`, `firestore.indexes.json`
4. Schedule engine — `app-schedule.service.js`
5. Dashboard — `app-dashboard.page.js`
6. Recurrence engine — `app-recurrence.service.js`
7. Notification engine — `server-reminder-engine.js`, `server-notification-router.js`
8. 8:45 PM accountability — `server-accountability-engine.js`
9. 10:15 PM accountability — same file, second check pass
10. PWA — `public/manifest.json`, `public/service-worker.js`
11. Google Calendar — `app-google-calendar.service.js`
12. Telegram — `server-telegram-bot.js`, `app-telegram.service.js`
13. Email — `server-email.service.js`
14. Reports — `app-report.service.js`, `app-reports.page.js`
15. Admin — `app-admin.page.js`
16. Security — `firestore.rules`, `SECURITY.md`
17. Testing — `recurrence.test.js`, `validation.test.js`, `TESTING.md`
18. Deployment — `DEPLOYMENT.md`, `.github/workflows/`

## 8. Explicit non-goals for v1 (documented per §33/§34)

- No `MANAGER`/`TEAM_LEADER` roles — only `USER` and `ADMIN`. The `role`
  field and rules are structured so adding roles later is additive, not a
  rewrite.
- No shared/group schedules yet — the schema reserves a
  `sharedWith: string[]` array on the schedule document (unused, always
  empty in v1) so this can be added later without a migration.
- No ICS export yet (mentioned as "potential future" in the brief) — CSV
  and JSON export are implemented; ICS is a documented TODO in
  `DATABASE.md`.
