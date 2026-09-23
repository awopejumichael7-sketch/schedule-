# TESTING.md

## Automated unit tests (included, verified passing)

Pure-logic modules — the recurrence engine and input validation — have no
Firebase dependency, so they're covered by real, runnable unit tests using
Node's built-in test runner (no extra dependencies):

```bash
node --test tests/*.test.js
```

**These were run during development and pass: 23/23 tests (15
recurrence, 8 validation).** Coverage includes:

- Daily, weekly, monthly, yearly, and custom recurrence expansion
- Weekly with multi-day `byDay` and `interval` > 1 (every-2-weeks)
- Monthly fixed-day-of-month with short-month clamping (§50)
- Monthly "first Monday" / "last Friday" position rules
- **Leap-year handling**: Feb 29 start date correctly clamps to Feb 28 in
  non-leap years (§50)
- **DST handling**: `resolveLocalToUTC` produces the correct UTC instant
  for both winter (EST) and summer (EDT) in `America/New_York`, and
  confirms `Africa/Lagos` (no DST) stays stable year-round (§14, §50)
- `endType`: `onDate` and `afterCount` recurrence termination
- Input validation: required fields, malformed dates/times, invalid
  enums, string length limits, null-safety

## What requires the Firebase Emulator Suite (not run here, but wired for)

Everything touching Firestore/Auth needs a live or emulated backend. Free,
local, no billing:

```bash
firebase emulators:start
# then point the app at emulators by setting window.__USE_EMULATORS__ = true
# before app-firebase-init.js loads (see that file's bottom section)
```

Recommended test matrix to run against the emulator before going live —
this mirrors §56/§57 of the brief:

### Functional (§56)
- [ ] Register + log in (email/password and Google)
- [ ] Create a schedule of each recurrence type; confirm it appears on the
      right dates in Calendar view
- [ ] Mark complete / incomplete / snooze / reschedule / skip an occurrence
      and confirm status persists and reflects in Reports
- [ ] Change timezone in Settings; confirm today's occurrence times shift
      accordingly in the dashboard
- [ ] Trigger `node server-reminder-engine.js` manually against a
      schedule with a reminder due "now"; confirm a notification doc with
      `status: "sent"` appears
- [ ] Trigger `node server-accountability-engine.js` with a user whose
      `accountability.firstCheckTime` is set to the current local minute;
      confirm the check fires and doesn't fire again on a second run
      (idempotency)
- [ ] Connect Google Calendar (end to end, real Google account in test
      mode); confirm an event appears on the selected calendar and
      `googleEventId` is stored
- [ ] Connect Telegram; run `node server-telegram-bot.js` after sending
      `/link <code>`; confirm `linked: true` and a real message arrives

### Security (§57) — run as two separate real user accounts, A and B
- [ ] As A, note a schedule ID; as B, attempt to read
      `users/{A_uid}/schedules/{id}` directly via the Firestore SDK —
      must be denied
- [ ] As B, attempt to write to `users/{A_uid}/schedules/{id}` — must be
      denied
- [ ] As A, attempt to set your own `role` field to `"ADMIN"` via a direct
      `updateDoc` call — must be denied by rules
- [ ] As A, attempt to write `calendarConnections/google.refreshToken`
      directly from the browser console — must be denied
- [ ] As A, attempt to write `telegramConnections/primary.chatId`
      directly — must be denied
- [ ] Sign out and attempt any Firestore read while unauthenticated —
      must be denied
- [ ] Submit a schedule title containing `<script>alert(1)</script>` —
      confirm it renders as inert text (dashboard uses `textContent`, not
      `innerHTML` — see `app-dom.utils.js`)

## Manual PWA/offline checklist (§35, §36)
- [ ] Load the app once online, then go offline (DevTools → Network →
      Offline) — dashboard and calendar should still render from cache
- [ ] Mark an occurrence complete while offline; go back online; confirm
      the write syncs to Firestore automatically (Firestore's own offline
      persistence handles this — see `app-firebase-init.js`)
- [ ] Install as PWA on at least one mobile and one desktop browser;
      confirm it opens standalone (no browser chrome)

## Continuous testing in CI (optional extension)

The unit tests are plain Node scripts with zero external dependencies, so
adding a `ci.yml` workflow that runs `node --test tests/` on every push is
a small, free addition (GitHub Actions, same free allowance as the
scheduled engines) — not included by default here to keep the initial
workflow count minimal, but straightforward to add by copying the
job structure from `.github/workflows/reminder-scheduler.yml` and
replacing the run step with `node --test tests/`.
