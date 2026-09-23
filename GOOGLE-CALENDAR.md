# GOOGLE-CALENDAR.md

## What SSAS requests, and why

SSAS requests exactly one OAuth scope:

```
https://www.googleapis.com/auth/calendar.events
```

This is the **minimal, least-privilege** scope for creating/reading/
updating/deleting individual events. It does **not** grant access to
calendar settings, sharing permissions, other calendars' visibility, or
any other Google service. Consent-screen copy shown to the user should
say plainly: *"SSAS will be able to create, view, and manage events it
creates on your selected calendar. It cannot see or change anything else
in your Google account."*

## One-time setup (you do this once, free, no billing account)

1. Go to https://console.cloud.google.com and create a new project (or
   reuse your Firebase project — they share the same underlying GCP
   project).
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (unless you have a Google Workspace org).
   - Fill in app name ("SSAS"), support email, developer contact.
   - Scopes: add `.../auth/calendar.events`.
   - Test users: add your own Google account(s) while in "Testing" mode.
   - **You do not need to submit for verification** to use SSAS
     personally or with a small number of test users — an unverified app
     in "Testing" mode works indefinitely for the accounts you list as
     test users. Verification is only required if you want the app to be
     usable by the general public without a warning screen.
4. **APIs & Services → Credentials → Create Credentials → OAuth client
   ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins: your Firebase Hosting URL (e.g.
     `https://your-project.web.app`) and `http://localhost:5000` for
     local testing.
   - Save the **Client ID** and **Client Secret**.
5. Put the Client ID in `app-firebase-config.js`
   (`GOOGLE_OAUTH_CLIENT_ID` — this is safe to be public).
   Put the Client ID **and** Client Secret in your GitHub Actions secrets
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) — the secret must never go
   in frontend code (see SECURITY.md).

## How the flow works end-to-end

1. User clicks "Connect Google Calendar" in Settings.
2. `googleCalendar.service.js` opens Google Identity Services' code-flow
   popup with `access_type: "offline"` (required to get a refresh token)
   and the minimal scope.
3. Google returns a one-time authorization **code** to the browser. The
   browser writes this code to
   `users/{uid}/calendarConnections/google.pendingAuthCode` — security
   rules permit the user to write only this field for themself.
4. On its next scheduled run (within 5 minutes), `reminder-engine.js`
   calls `exchangePendingAuthCodes()` in `google-calendar-sync.js`, which
   uses the Admin SDK's trusted environment to exchange the code for an
   access token + **refresh token** using the Client Secret. The refresh
   token is written to Firestore server-side only.
5. From then on, `syncOccurrenceToGoogle()` uses the stored refresh token
   to mint short-lived access tokens as needed and create/update/delete
   the mirrored Google Calendar event, storing the resulting
   `googleEventId` back on the occurrence (§4's "store the relationship").

## Why the 5-minute delay on step 4 is acceptable

This is the one place in SSAS where the "no billing account for
scheduled compute" constraint has a visible UX cost: connecting Google
Calendar takes up to 5 minutes to go from "clicked Connect" to "actually
synced," instead of being instant. The Settings page shows a live status
badge (`watchGoogleCalendarStatus`) so the user sees this resolve
automatically. If instant linking matters more to you than the zero-cost
constraint, see the "always-on backend" note in ARCHITECTURE.md §"What to
do if you fork this."

## Handling revoked/expired authorization (§49)

If a sync call returns 401/403, `google-calendar-sync.js` sets
`syncStatus: "needs_attention"`, and Settings surfaces: *"Your Google
Calendar connection needs attention."* with a reconnect button. SSAS does
not retry indefinitely against a broken connection (see NOTIFICATIONS.md).

## Token refresh

Refresh tokens from Google don't expire on a fixed schedule (they can be
used indefinitely unless revoked by the user or unused for 6 months), so
no separate "refresh the refresh token" job is needed — `googleapis`'
OAuth2 client automatically exchanges the refresh token for a new access
token on each sync call.
