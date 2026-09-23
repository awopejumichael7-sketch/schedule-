# TROUBLESHOOTING.md

Users should never see raw technical errors (§44) — the app shows
"Something went wrong. Please try again." for unexpected failures.
This file is the developer-facing counterpart.

## Auth

**"auth/configuration-not-found" or sign-in silently fails**
Email/Password or Google sign-in isn't enabled in Firebase Console →
Authentication → Sign-in method.

**Google sign-in popup closes immediately**
Your Hosting URL isn't in Authentication → Settings → Authorized domains.
Add both your Firebase Hosting domain and `localhost` for local dev.

## Firestore

**"Missing or insufficient permissions"**
Expected behavior when rules correctly deny something — check
`firestore.rules` against what the code is trying to do. If it's
a genuine bug, compare the failing read/write path against
`DATABASE.md`'s schema; a common cause is writing a field the rules
explicitly exclude (e.g. trying to set `refreshToken` from client code).

**Composite index errors ("The query requires an index...")**
Firestore's error message includes a direct console link to create the
missing index — click it, or add the equivalent entry to
`firestore.indexes.json` and redeploy:
```
firebase deploy --only firestore:indexes
```

## Reminder / accountability engines

**GitHub Actions workflow shows red/failed**
Open the run's logs first — the two most common causes:
1. `FIREBASE_SERVICE_ACCOUNT_JSON is not set` → the secret is missing or
   named differently than expected; check Settings → Secrets → Actions.
2. `FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON` → the key was pasted
   with line breaks preserved; re-minify with the one-liner in
   `DEPLOYMENT.md` §6.

**Reminders never arrive, but the workflow shows green**
Check, in order:
1. Is the schedule's `status` `"active"`? Cancelled schedules are skipped.
2. Does the reminder's `channels` array include the channel you're
   checking, AND is that channel enabled in
   `notificationPreferences/settings`? Both must be true.
3. For email: check `users/{uid}/notifications/{key}` for a `failed`
   status and `failureReason` — often a Gmail App Password typo.
4. For Telegram: is `telegramConnections/primary.linked` actually `true`?
   Linking requires the *next* scheduled run after `/link <code>` is
   sent — allow up to 5 minutes.
5. Was the reminder's due time more than `STALE_THRESHOLD_MINUTES` (60,
   by default) in the past by the time a run actually executed? This is
   deliberate stale-reminder suppression (§66), not a bug — check the
   workflow's run history for a gap.

**Accountability check-in never fires**
Confirm the user's `accountability.firstCheckEnabled` /
`secondCheckEnabled` is `true`, and that `timezone` is a valid IANA name
(e.g. `Africa/Lagos`, not `WAT` or a UTC offset string) — an invalid
timezone silently falls back to server-default formatting behavior in
`Intl.DateTimeFormat`, which can shift the computed local time.

## Google Calendar

**"Your Google Calendar connection needs attention"**
The stored refresh token was rejected (401/403) — usually because the
user revoked SSAS's access in their Google Account settings, or the
OAuth consent screen's test-user list no longer includes them. Have them
disconnect and reconnect in Settings.

**Connected, but events never appear**
Check `calendarConnections/google.pendingAuthCode` — if it's still
present and non-null, the exchange script hasn't run yet (wait for the
next 5-minute cycle) or is failing; check the reminder-engine workflow
logs for `Google OAuth exchange failed for user...`.

## Telegram

**`/link` says "invalid or expired"**
Link codes expire after 10 minutes (`linkCodeExpiresAt`) — generate a
fresh one from Settings.

**Bot never responds to any command**
Confirm `TELEGRAM_BOT_TOKEN` is set as a GitHub secret and that the
reminder-scheduler workflow (which also polls Telegram — see
`server-telegram-bot.js`'s header comment) is actually running; check
its logs for `[reminder-engine] telegram poll failed:`.

## PWA / offline

**"Add to Home Screen" doesn't appear**
Requires HTTPS (Firebase Hosting provides this automatically), a valid
`manifest.json` with real icon files (see `ICONS-README.md` — the
manifest references files that must actually exist), and a registered
service worker. Check DevTools → Application → Manifest for specific
validation errors.

**Offline changes don't sync back**
Firestore's offline persistence (`enableIndexedDbPersistence`) is
disabled automatically if multiple tabs of the app are open
simultaneously — this is logged as a warning, not silently failing. Close
extra tabs, or accept single-tab offline support as documented in
`app-firebase-init.js`.

## General principle for any error not listed here

Reproduce with the Firebase Emulator Suite locally (`firebase emulators:
start`) so you get full stack traces instead of production's sanitized
error message, then check the relevant `docs/*.md` file for the
subsystem involved.
