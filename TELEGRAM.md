# TELEGRAM.md

## Creating your bot (free, ~2 minutes)

1. Open Telegram, search for **@BotFather**, start a chat.
2. Send `/newbot`, follow the prompts (choose a name and a unique
   `@username` ending in `bot`).
3. BotFather replies with your **bot token** — looks like
   `123456789:AAExampleTokenFromBotFather`.
4. Put this token **only** in your GitHub Actions secret
   `TELEGRAM_BOT_TOKEN` (Settings → Secrets and variables → Actions). It
   must never appear in `public/` — see SECURITY.md.

That's it — no billing, no card, no approval process. Telegram bots are
free with no tiered pricing.

## How linking works (§9)

1. In SSAS Settings, the user clicks "Connect Telegram."
2. `requestTelegramLinkCode()` generates a random 6-digit code and writes
   it to `users/{uid}/telegramConnections/primary.linkCode` (expires in
   10 minutes). Security rules allow the user to write only this field —
   never `chatId` (see firestore.rules).
3. The user opens their chat with the SSAS bot and sends `/link 123456`.
4. `telegram-bot.js` (running server-side, holding the real token) looks
   up which pending link matches that code, and — only if it's found and
   not expired — writes `chatId` and `linked: true`. This is the *only*
   code path that can ever set `chatId`.
5. Telegram becomes an available notification channel in Settings.

## Why polling-once-per-run, not a persistent bot

A classic Telegram bot keeps an open connection (`bot.on("message", ...)`)
on an always-on server — which is exactly the kind of paid, always-on
compute this project avoids. Telegram's `getUpdates` endpoint queues
unread updates on Telegram's side, so `telegram-bot.js` calls it briefly
once per 5-minute GitHub Actions run, processes whatever arrived, records
its offset, and exits. See the header comment in `server-telegram-bot.js`
for the full reasoning.

**Practical effect:** command replies and inline-button actions land
within about 5 minutes, not instantly. This is disclosed here rather than
silently shipped as if it were real-time.

## Upgrading to a webhook (optional, still free, but not zero-infrastructure)

If you want sub-second responses, Telegram also supports **webhooks**:
Telegram POSTs updates to a URL you register, instead of you polling. This
requires a small always-listening HTTPS endpoint — e.g. a free Cloudflare
Worker or a free-tier Render/Fly.io web service. This is a legitimate free
option but was **not** chosen as the default here because those platforms'
"free tier" terms (spin-down behavior, monthly request caps, and whether a
card is required) vary and can change; §2 of the brief asks that nothing
be assumed free without verification. GitHub Actions' scheduled-polling
approach has a documented, stable, no-card-required free allowance, so
it's the default. If you adopt a webhook host, swap
`runTelegramBotOnce()`'s trigger from the GitHub Actions cron to that
host's incoming-request handler — the command logic itself doesn't change.

## Supported commands (§47)

| Command | Behavior |
|---|---|
| `/start` | Welcome message + linking instructions |
| `/help` | Lists commands |
| `/link <code>` | Completes account linking |
| `/today` | Lists today's schedule (title + time), sorted |
| `/settings` | Points the user back to the SSAS app |

`/next`, `/pending`, `/completed` are documented as planned follow-ups —
the query patterns they need (single-occurrence "next up" and status
filtering) already exist in `app-schedule.service.js`'s
`getOccurrencesInWindow`; wiring them into the bot is a small, additive
change once you want them (add a case to `handleCommand()` in
`telegram-bot.js`).

## Test message (§9)

Settings → Telegram → "Send test notification" enqueues:

> SSAS Telegram notification is working successfully.

which the reminder engine's next run delivers via the same
`notification-router.js` path real reminders use — so a successful test
message means the whole pipe (bot token, chat linking, network) is
actually working end-to-end, not a canned UI response.
