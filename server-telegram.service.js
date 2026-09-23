// telegram.service.js (server-side) — thin wrapper for sending messages
// through the Telegram Bot API (§9, §73). The bot TOKEN lives only in
// process.env.TELEGRAM_BOT_TOKEN (a GitHub Actions secret) and is never
// imported by any browser-facing code.

const API_BASE = "https://api.telegram.org";

function requireToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set — see TELEGRAM.md.");
  return token;
}

export async function sendTelegramMessage(chatId, text, replyMarkup) {
  const token = requireToken();
  const body = { chat_id: chatId, text, parse_mode: "Markdown" };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) return { ok: false, error: data.description };
  return { ok: true, messageId: data.result.message_id };
}

export function reminderKeyboard(occurrenceId) {
  return {
    inline_keyboard: [[
      { text: "✅ Mark complete", callback_data: `complete:${occurrenceId}` },
      { text: "⏰ Snooze 15m", callback_data: `snooze:${occurrenceId}` },
      { text: "↻ Reschedule", callback_data: `reschedule:${occurrenceId}` },
    ]],
  };
}

export function accountabilityKeyboard(kind) {
  if (kind === "first") {
    return { inline_keyboard: [[
      { text: "✅ Everything is complete", callback_data: "accountability_first:all_done" },
      { text: "⏳ Some are still pending", callback_data: "accountability_first:pending" },
    ]] };
  }
  return { inline_keyboard: [[
    { text: "Mark complete", callback_data: "accountability_second:complete" },
    { text: "Reschedule", callback_data: "accountability_second:reschedule" },
    { text: "Skip", callback_data: "accountability_second:skip" },
    { text: "Leave incomplete", callback_data: "accountability_second:incomplete" },
  ]] };
}
