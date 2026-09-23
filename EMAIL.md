# EMAIL.md

## Setup (free, ~3 minutes, requires a Gmail account you control)

1. Enable **2-Step Verification** on the Gmail account SSAS will send
   from: https://myaccount.google.com/security
2. Generate an **App Password**: https://myaccount.google.com/apppasswords
   — choose "Mail" / "Other (custom name)" → "SSAS". Google gives you a
   16-character password.
3. Set GitHub Actions secrets:
   - `GMAIL_USER` = the Gmail address
   - `GMAIL_APP_PASSWORD` = the 16-character app password (**not** your
     normal Gmail login password — that would fail, and using it would
     also be a needless security downgrade)

No billing account, no API key request, no approval wait. This is
Google's standard consumer SMTP relay, accessed via
[Nodemailer](https://nodemailer.com)'s built-in `service: "gmail"`
transport.

## Why not SendGrid/Mailgun/etc.

Those are excellent products, but their free tiers (as of this writing)
either cap at a low daily/monthly volume that requires a credit card on
file to unlock, or have changed their free-tier terms multiple times in
recent years. Gmail SMTP's ~500-message/day consumer limit is
well-documented, stable, and needs no card — see FREE-TIER-LIMITS.md.

## Where sending happens

`server-email.service.js`, called from `notification-router.js`
(reminders) and directly from `accountability-engine.js` (check-ins) and
the (documented, wireable) digest jobs. All email sending happens in the
GitHub Actions runner — **never** in the browser, since that would
require shipping SMTP credentials to every user's device.

## Templates actually implemented

**Reminder** (`sendReminderEmail`) — matches §8's exact template:

```
Subject: Reminder: {{scheduleTitle}}

Hello {{userName}},

This is a reminder that:

{{scheduleTitle}}

Date:
{{date}}

Time:
{{time}}

Description:
{{description}}

Priority:
{{priority}}

You can open SSAS to mark this activity as completed.

Regards,
SSAS
```

**Accountability check-in** (`sendAccountabilityEmail`) — the check
question plus the same today's-activities summary shown in the app/
Telegram.

**Digest** (`sendDigestEmail`) — daily/weekly/monthly summary text; wired
to the user's `notificationPreferences.dailyEmailDigest` /
`weeklyEmailDigest` / `monthlyEmailDigest` flags. The digest *trigger*
(deciding when a weekly/monthly digest is due, similar to the
accountability engine's per-user-timezone window check) is a small,
additive extension of `accountability-engine.js`'s pattern — implement by
adding a `processUserForDigest(userDoc, period)` following the same
idempotency-by-period-key approach as `alreadySent()`.

## Rate-limit behavior

Nodemailer surfaces Gmail's own throttling as a send error; when that
happens, `notification-router.js` records `status: "failed"` with the
failure reason rather than retrying in a loop (§45 — no endless retries).
