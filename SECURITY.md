# SECURITY.md

## Core principle

Every piece of user content lives at `users/{uid}/...` and every Firestore
security rule reduces to a variant of `request.auth.uid == uid`. See
`firestore.rules` for the literal enforcement.

## Secrets — what's server-only vs client-safe

| Secret | Lives in | Never appears in |
|---|---|---|
| Firebase Web API config (`apiKey`, `projectId`, etc.) | `app-firebase-config.js` | — this is safe to ship client-side; it's a project identifier, not a credential. Firestore/Auth security is enforced by rules, not by hiding this. |
| Google OAuth **Client Secret** | GitHub Actions secret `GOOGLE_CLIENT_SECRET`, used only in `scripts/` during the server-side token exchange | Frontend code. The frontend only ever uses the OAuth **Client ID** (public by design) via Google Identity Services' implicit/PKCE flow, or hands the auth code to the backend script for exchange. |
| Google refresh token (per user) | `users/{uid}/calendarConnections/google.refreshToken`, written **only** by the Admin SDK (server) | Client writes to this field are rejected by security rules (see rules file — the diff check excludes `refreshToken`). |
| Telegram bot token | GitHub Actions secret `TELEGRAM_BOT_TOKEN` / server `.env` | Never sent to the browser. The client only ever sees a short-lived, single-use `linkCode`. |
| Gmail App Password | GitHub Actions secret `GMAIL_APP_PASSWORD` / server `.env` | Never sent to the browser. |
| Firebase **Admin SDK** service account JSON | GitHub Actions secret `FIREBASE_SERVICE_ACCOUNT` | Never in the repo, never in frontend code. `.gitignore` explicitly excludes any `*serviceAccount*.json`. |

## Threat list and mitigation (§57)

| Threat | Mitigation |
|---|---|
| User A reads User B's schedules | Rules deny all reads outside `users/{request.auth.uid}/...`; there is no query path that can span users since no top-level collection lists schedules |
| User A writes/deletes User B's schedule | Same rule — write requires `isOwner(uid)` |
| Client escalates its own role to ADMIN | `users/{uid}` update rule explicitly requires `incoming.role == resource.data.role`; only the Admin SDK (bypassing rules) or an existing ADMIN via the constrained admin-update rule can change it, and the admin-update rule only allows the `disabled` field, not `role` |
| Client writes its own Google refresh token or Telegram chatId | Rules restrict the writable-field set on those documents to explicitly exclude `refreshToken` / `chatId` |
| Unauthenticated read of any document | `isSignedIn()` gate on every rule; default-deny fallback rule at the bottom of the ruleset |
| Malformed/oversized input | Client-side validation in `app-validation.utils.js` before any write; Firestore rejects documents over 1 MiB regardless |
| Expired Firebase Auth session | Firebase Auth SDK auto-refreshes ID tokens; rules re-evaluate `request.auth` on every request, so an expired/invalid token is simply unauthenticated |
| Revoked Google Calendar authorization | Detected on next sync attempt (401/invalid_grant from Google) → `syncStatus` set to `needs_attention`, surfaced in Settings; sync engine does not retry indefinitely |
| Replay/duplicate notification | Deterministic idempotency key per notification (see NOTIFICATIONS.md) checked before send |
| XSS via schedule title/notes | All user-generated text is inserted via `textContent`, never `innerHTML`, in the rendering layer (`app-dom.utils.js`); no field is ever interpolated into HTML strings |
| CSRF | N/A in the classic sense — Firebase Auth uses bearer ID tokens over HTTPS, not ambient cookies, for Firestore access; the only cookie-adjacent surface is the OAuth redirect, which uses `state` parameter validation (see `googleCalendar.service.js`) |
| Admin viewing user's private schedule content | Rules restrict admin's `users/{uid}` update to the `disabled` field only, and admin has **no** grant at all on `schedules`, `scheduleOccurrences`, `completionRecords`, `telegramConnections`, or `calendarConnections` subcollections — only the owner can read those, full stop |

## Least-privilege OAuth scopes (§72)

SSAS requests exactly one Google scope:

```
https://www.googleapis.com/auth/calendar.events
```

This grants create/read/update/delete on **events** only — not calendar
settings, not other Google services, not the full `calendar` scope which
also allows deleting entire calendars. See `GOOGLE-CALENDAR.md` for
the consent-screen copy shown to users explaining this.

## Rate limiting

Firestore Security Rules cannot themselves rate-limit, but:
- Firestore's own per-project quota naturally caps abuse.
- The reminder/accountability engines run on a fixed schedule (every 5
  minutes via GitHub Actions), not on-demand from the client, so they
  cannot be triggered repeatedly by a malicious client.
- `server-notification-router.js` enforces "max 1 retry, then mark
  failed" — see NOTIFICATIONS.md — preventing runaway retry storms.

## What to do if you fork this for production/commercial use

1. Move Google token refresh and Telegram linking behind a real backend
   (Cloud Run / any small Node host) rather than a scheduled script, so
   linking is instant instead of "wait for the next 5-minute run."
2. Add App Check (free) to block non-app clients from hitting Firestore
   directly.
3. Rotate the Firebase Admin service account key periodically and store it
   in a secrets manager rather than a CI secret, if moving off GitHub
   Actions.
