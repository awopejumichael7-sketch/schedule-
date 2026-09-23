# NOTIFICATIONS.md

## Pipeline

```
Schedule → Occurrence → Reminder → Notification Queue → Channel Router
                                                            ├── Push (FCM)
                                                            ├── Email (Gmail SMTP)
                                                            ├── Telegram (Bot API)
                                                            └── Google Calendar (native)
```

Implementation: `server-reminder-engine.js` (orchestration, runs every 5
minutes) → `server-notification-router.js` (channel dispatch + fallback)
→ per-channel service files.

## Idempotency (§51, §67)

Every notification attempt is keyed by:

```
{occurrenceId}:{offsetMinutes}:{channel}
```

stored at `users/{uid}/notifications/{key}`. Before sending, the router
checks whether that document already has `status: "sent"` — if so, it's a
no-op. This means:

- The engine can be re-run, or overlap with the previous run, without
  double-sending.
- A reminder with 3 configured channels produces 3 distinct keys, so each
  channel's own success/failure is tracked independently.

## Failure handling & fallback (§45)

Channels are grouped:

- **Fallback chain**: `push → email → telegram`, in that order, among
  whichever of these three the schedule's reminder actually requests. The
  router tries the first, and only moves to the next if the previous one
  failed. It stops at the first success — this is what §45 means by "try
  email if push fails, try Telegram if email fails," without also
  spamming every channel that happens to succeed after an earlier failure.
- **Independent channel**: `googleCalendar` is not part of the fallback
  chain (a native calendar reminder isn't a "delivery" in the same sense)
  and is always attempted on its own if requested.

No channel is retried more than once per scheduled run (§45 "do not
endlessly retry"). If a channel keeps failing across multiple runs (e.g.
Telegram unlinked), each run records a fresh `failed` status with a
reason — visible in the user's Notification History (§46) — but the
`attempt` counter is purely informational, not a retry budget the engine
enforces; the *idempotency* guarantee is what actually prevents runaway
retries; a channel that failed simply won't have `status: "sent"`, so the
next scheduled run (for a *different*, later-due reminder) doesn't retry
the same past-due one — see "Missed Reminder Recovery" below.

## Missed reminder recovery (§66)

If the reminder engine doesn't run for a while (GitHub Actions outage,
workflow disabled, etc.) and a reminder's due instant is now more than
`STALE_THRESHOLD_MINUTES` (default 60) in the past, the engine skips
sending it rather than delivering a stale notification hours late. This
check lives in `reminder-engine.js`:

```js
const minutesLate = (now - dueAt) / 60000;
if (minutesLate < 0) continue;             // not due yet
if (minutesLate > STALE_THRESHOLD_MINUTES) continue; // too stale, skip
```

## Smart reminder logic (§65)

- Completed/cancelled/skipped occurrences are filtered out before any
  reminder is even considered — no unnecessary notifications after
  completion.
- Rescheduling an occurrence changes its materialized status to
  `rescheduled`; because the reminder loop keys off the *original*
  occurrence date/time, a rescheduled occurrence naturally stops matching
  "due now" for its old slot. (A reminder for the *new* slot is a
  documented follow-up: on reschedule, re-run the reminder-offset
  computation against `rescheduleDate`/`rescheduleTime` — the hook point
  is `schedule.service.js`'s `rescheduleOccurrence()` on the client and
  the equivalent block in `reminder-engine.js`.)
- Skipping a recurring occurrence only marks that single occurrence
  `skipped` — the recurrence rule on the parent `schedules` document is
  untouched, so future occurrences are unaffected (§65).

## Notification log (§46)

`users/{uid}/notifications/*` doubles as both the idempotency ledger and
the user-facing history — Settings/History reads it directly (owner-read
rule in firestore.rules) rather than maintaining a second collection.

## Duplicate prevention summary (§67)

| Mechanism | Prevents |
|---|---|
| Deterministic idempotency key | Same reminder+channel sent twice |
| Per-day accountability key (`accountability_{kind}_{date}`) | Same check-in sent twice in one local day |
| `occurrenceId = {scheduleId}_{isoDate}` | Two different code paths accidentally creating two occurrence records for the same day |
