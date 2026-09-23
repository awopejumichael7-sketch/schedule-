# SSAS — Smart Schedule & Accountability System

A multi-user, installable (PWA) personal scheduling, reminder, calendar-sync
and accountability system, built on a **zero-budget** stack: Firebase's free
Spark plan + GitHub Actions (free scheduled compute) + free-tier Gmail SMTP +
a free Telegram bot.

This README is the entry point. Read the other `.md` files in this same
folder for the full picture before you deploy anything.

## Folder structure: everything lives in one flat folder

Every file — frontend, backend automation, config, tests, and
documentation — sits directly in this one folder. Nothing is nested, with
a single unavoidable exception explained below. Since there are no
subfolders to organize by, every filename carries a prefix that tells you
what it is:

| Prefix / pattern | What it means | Example |
|---|---|---|
| `app-*` | Frontend PWA code — runs in the user's browser | `app-dashboard.page.js` |
| `server-*` | Backend automation — runs only in GitHub Actions via the Admin SDK, never in the browser | `server-reminder-engine.js` |
| `*.page.js` | A full screen/route of the app | `app-settings.page.js` |
| `*.service.js` | A focused module wrapping one concern (auth, a specific API, etc.) | `app-auth.service.js` |
| `*.utils.js` | Small, dependency-free helper functions | `app-date.utils.js` |
| `*.component.js` | A reusable UI piece used by more than one page | `app-schedule-form.component.js` |
| `*.test.js` | An automated test, runnable with `node --test *.test.js` | `recurrence.test.js` |
| `ALL-CAPS.md` | Project documentation | `ARCHITECTURE.md`, `SECURITY.md` |
| Plain lowercase config files | Tooling config, read by their respective tools by convention | `firebase.json`, `manifest.json`, `package.json` |

**The one unavoidable exception:** the two files under
`.github/workflows/`. GitHub Actions — the free scheduled-compute engine
this project relies on for reminders and accountability check-ins (see
"Why this stack" below) — only ever discovers workflow files at the
literal path `.github/workflows/*.yml` relative to the repository root.
There is no setting to point it anywhere else, so this is a platform
requirement, not a design choice. Every file those workflows actually run
(`package.json`, `server-*.js`) still lives in the single flat folder
alongside everything else.

**One consequence worth knowing:** because the frontend (`index.html`,
`app-*.js`, `styles.css`) and the backend/config/docs/tests all sit in the
same physical folder, `firebase.json`'s Hosting configuration explicitly
lists which files are excluded from what actually gets deployed to the
public web (`server-*.js`, `*.test.js`, `package.json`, every `.md` file,
`firestore.rules`, and anything starting with a dot) — see its `ignore`
array. This keeps the on-disk layout flat while keeping only the actual
frontend publicly reachable once deployed. Physical location and public
exposure are two different things, and that ignore list is what keeps
them that way.

## What's actually in this folder

| Area | Status | Where |
|---|---|---|
| Frontend PWA (auth, dashboard, schedule CRUD, calendar view, settings, reports, admin) | **Fully implemented, working code** | `index.html` + every `app-*.js` file |
| Recurrence engine (daily/weekly/monthly/yearly/custom, DST/leap-year safe) | **Fully implemented** | `app-recurrence.service.js` |
| Firestore security rules (per-user isolation) | **Fully implemented** | `firestore.rules` |
| Offline support + installable PWA | **Fully implemented** | `service-worker.js`, `manifest.json` |
| Notification engine (push / email / Telegram / Google Calendar router, idempotent) | **Fully implemented, runs as a Node script** | `server-reminder-engine.js` |
| 8:45 PM / 10:15 PM accountability engine | **Fully implemented, runs as a Node script** | `server-accountability-engine.js` |
| Free scheduler (replaces paid Cloud Scheduler / Blaze-plan Cloud Functions) | **Fully implemented** | `.github/workflows/*.yml` |
| Google Calendar OAuth + event sync | **Fully implemented client code** — needs *your* OAuth client ID | `app-google-calendar.service.js`, `GOOGLE-CALENDAR.md` |
| Telegram bot (linking, commands, push) | **Fully implemented** — needs *your* bot token from @BotFather | `server-telegram-bot.js`, `TELEGRAM.md` |
| Email sending (Nodemailer over Gmail) | **Fully implemented** — needs *your* Gmail App Password | `server-email.service.js`, `EMAIL.md` |
| Reports (daily/weekly/monthly/yearly) | **Fully implemented** | `app-report.service.js` |
| Admin dashboard | **Fully implemented** | `app-admin.page.js` |
| Cost Safety Dashboard | **Fully implemented** | `app-cost-safety.page.js` |

**Why some pieces "need your credentials":** Google OAuth client IDs,
Telegram bot tokens, and Gmail App Passwords are, by design, tied to *your*
accounts. No one — including me — can generate a working Google OAuth
client or a live Telegram bot on your behalf; that would mean holding a
credential capable of acting as you. Every place that needs one is isolated
behind an environment variable (see `.env.example`) and documented step by
step in `DEPLOYMENT.md`. Nothing is hard-coded, faked, or stubbed out —
the code paths are real and call the real APIs the moment you supply a key.

## Why this stack (short version — full reasoning in `ARCHITECTURE.md`)

- **Firebase Auth + Firestore (Spark/free plan):** generous free quotas
  (50K reads/20K writes/20K deletes per day, 1GiB storage), no credit card
  required to start, native per-user security rules.
- **No Cloud Functions on a schedule.** Scheduled (cron) Cloud Functions
  require Firebase's **Blaze (pay-as-you-go) plan**, even if usage stays
  at $0 — it requires linking a billing account. To honor the "no billing
  account, no surprise charges" requirement, SSAS instead uses **GitHub
  Actions scheduled workflows** (2,000 free minutes/month on free GitHub
  accounts) to run the reminder and accountability engines as plain Node
  scripts using the Firebase **Admin SDK** (which doesn't require Blaze).
- **Gmail SMTP via Nodemailer** instead of SendGrid/Mailgun: free, no
  billing account, ~500 emails/day limit (documented in
  `FREE-TIER-LIMITS.md`).
- **Telegram Bot API**: entirely free, no rate-limit billing risk.
- **Google Calendar API**: free within Google's standard per-user quota
  (1,000,000 queries/day project-wide, effectively unlimited for personal
  use); OAuth client creation is free, no billing account required unless
  you exceed quota far beyond what an individual/small team would.

## Quick start

Run every command below from this same folder — there's nowhere else to
`cd` into.

```bash
# 1. Install dependencies for the automation scripts (server-*.js)
npm install

# 2. Copy and fill in your own secrets (see DEPLOYMENT.md)
cp .env.example .env

# 3. Serve the frontend locally (any static server works; this folder
#    also contains non-frontend files, but firebase.json's hosting.ignore
#    list keeps them out of what actually gets served/deployed)
npx serve .
# or: firebase serve --only hosting

# 4. Deploy Firestore rules
firebase deploy --only firestore:rules

# 5. Wire up GitHub Actions secrets (Settings → Secrets → Actions) for
#    the two scheduled workflows in .github/workflows/
```

Full step-by-step deployment: `DEPLOYMENT.md`.

## Documentation index

- `ARCHITECTURE.md` — full architecture reasoning, diagrams, phase plan
- `DATABASE.md` — Firestore schema, indexes, query patterns
- `SECURITY.md` — security model, rules walkthrough, threat list
- `GOOGLE-CALENDAR.md` — OAuth setup, scopes, sync logic
- `TELEGRAM.md` — bot creation, linking flow, commands
- `EMAIL.md` — Gmail App Password setup, template, limits
- `NOTIFICATIONS.md` — notification engine, channel router, idempotency
- `DEPLOYMENT.md` — full free deployment walkthrough
- `FREE-TIER-LIMITS.md` — every free-tier ceiling, verified, with links
- `TESTING.md` — test plan and how to run it
- `TROUBLESHOOTING.md` — common errors and fixes

## The zero-cost promise

Nothing in this codebase silently calls a paid API. Every external call is
listed in `FREE-TIER-LIMITS.md` with its actual free ceiling, whether a
card is required, and what happens (a warning, not a charge) as you
approach it. See the in-app **Cost Safety Dashboard** (`Settings → Cost
Safety`).
