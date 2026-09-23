# FREE-TIER-LIMITS.md

This document exists because §2 of the brief requires: never claim a
service is free without checking, and never let SSAS silently escalate
into a paid tier. Every ceiling below is the *documented* free-tier limit
at the time this was written. **Terms change** — re-check the linked
source before relying on this for a production deployment months from
now.

| Service | Free ceiling | Card required? | What happens if you exceed it |
|---|---|---|---|
| **Firestore** (Spark plan) | 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day, 1 GiB stored | No | Firestore returns quota-exceeded errors; it does **not** silently upgrade you. You'd need to manually enable the Blaze plan. |
| **Firebase Authentication** | Unlimited email/password + Google sign-in on Spark | No | N/A — no metered limit for these providers |
| **Firebase Hosting** (Spark) | 10 GB stored, 360 MB/day transfer | No | Deploys/serves may be throttled; again, requires a manual plan change to lift |
| **Firebase Cloud Messaging (push)** | Unlimited sends | No | N/A |
| **GitHub Actions** (Free personal plan) | 2,000 minutes/month (Linux runners) | No | Workflow runs stop until the next monthly reset, or you enable billing manually |
| **Gmail SMTP sending** | ~500 messages/day per consumer Gmail account (Google's documented anti-abuse limit) | No | Google temporarily blocks further sends from that account for a cooldown period |
| **Telegram Bot API** | No published hard cap; soft rate limit ≈30 messages/second bot-wide, ≈1 message/second per chat | No | Telegram returns HTTP 429 with a `retry_after` value; irrelevant at personal/small-team scale |
| **Google Calendar API** | 1,000,000 queries/day per Cloud project (default quota) | No | Returns quota errors; raising it further requires a request to Google, not automatic billing |
| **Google OAuth ("Testing" publish status)** | No enforced user cap while you manage the test-user list yourself | No | None — this only becomes relevant if you formally publish for the general public |

## Where SSAS's own design keeps usage inside these ceilings

- **Occurrence materialization is lazy** (ARCHITECTURE.md §6): a daily
  recurring schedule over a year does **not** create 365 documents unless
  each day's status actually changes. Untouched future occurrences are
  computed in memory by the recurrence engine and never written to
  Firestore. This is the single biggest lever keeping Firestore writes
  low.
- **The reminder/accountability engines only touch documents for users
  with active schedules due "now"** — they don't rescan a user's entire
  history each run.
- **Idempotency keys prevent duplicate writes** from overlapping runs.
- **The reminder/accountability engines run every 5 minutes for a few
  seconds each** — at roughly 10–20 seconds per run × 2 workflows × 288
  runs/day, that's well under an hour of GitHub Actions minutes per day,
  a small fraction of the monthly 2,000-minute allowance even before
  GitHub's free 20-minutes-per-job concurrency headroom.

## Rough math: how many users before you'd approach a real ceiling?

Firestore's 50K reads/day is the tightest constraint. Each reminder-engine
run per active user costs roughly: 1 read (schedules) + 1 read
(occurrences window) + 1 read (notification prefs) + 1 read (calendar
connection) + a handful of idempotency-key reads for due reminders — call
it ~5–10 reads per user per run in the common case. At 288 runs/day, that
budget supports on the order of a few dozen genuinely active users
comfortably within the free daily read quota, more if most users have few
schedules due on a given day. **This is exactly why §1 of the brief asks
for an architecture that "can eventually support hundreds or thousands of
users without redesigning the database"** — the per-user isolation model
(ARCHITECTURE.md §5) means scaling past this ceiling later is a matter of
enabling the Blaze plan (pay-as-you-go, and Firestore's paid tier is
inexpensive per operation) or optimizing read batching — **not** a schema
rewrite.

## Cost Safety Dashboard (§52)

`app-cost-safety.page.js` surfaces this table inside the app
itself (Settings → Cost safety) so you don't have to come back to this
file to remember the numbers. It's intentionally static/documentary
rather than pretending to meter live Firebase project usage — real-time
usage graphs live in the Firebase Console itself
(console.firebase.google.com → your project → Usage and billing), which
is the authoritative source; SSAS links there rather than re-implementing
it unreliably.

## The one manual step to stay safe long-term

Set a **budget alert** (not a hard cap — Google doesn't offer automatic
hard caps that don't also require Blaze) in Google Cloud Console →
Billing → Budgets & alerts, even while on Spark, so that if you ever do
enable Blaze later, you get emailed before any meaningful spend
accumulates. This is optional but recommended if you outgrow the free
tier and want a safety net rather than none at all.
