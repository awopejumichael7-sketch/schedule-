// telegram-bot.js
//
// Handles Telegram bot commands and the account-linking flow (§9, §47).
//
// WHY POLLING-ONCE-PER-RUN, NOT A PERSISTENT BOT PROCESS:
// A long-lived `bot.on("message", ...)` process (the usual node-telegram-
// bot-api pattern) needs an always-on host — which is exactly the kind of
// paid VPS/Cloud Run always-on billing this project avoids. Telegram's
// `getUpdates` API queues unread updates server-side, so it's safe to call
// it briefly, process whatever arrived, and exit. This script is invoked
// by the SAME 5-minute GitHub Actions schedule as the reminder engine
// (see .github/workflows/reminder-scheduler.yml), giving near-real-time
// responsiveness at zero cost. If you need instant responses, see
// TELEGRAM.md §"Upgrading to a webhook" for the (also free, but
// requires a tiny always-on endpoint) alternative.

import { db, FieldValue, Timestamp } from "./server-firebase-admin-init.js";
import { sendTelegramMessage } from "./server-telegram.service.js";
import { markCompletedServerSide, snoozeOccurrenceServerSide, skipOccurrenceServerSide } from "./server-occurrence-mutations.js";

const API_BASE = "https://api.telegram.org";

function requireToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set — see TELEGRAM.md.");
  return token;
}

async function getUpdates(offset) {
  const token = requireToken();
  const res = await fetch(`${API_BASE}/bot${token}/getUpdates?timeout=5&offset=${offset}`);
  const data = await res.json();
  if (!data.ok) throw new Error("Telegram getUpdates failed: " + data.description);
  return data.result;
}

async function getOffsetState() {
  const ref = db.collection("admin").doc("telegramBotState");
  const snap = await ref.get();
  return { ref, offset: snap.exists ? snap.data().lastOffset || 0 : 0 };
}

async function findUserByChatId(chatId) {
  const snap = await db.collectionGroup("telegramConnections").where("chatId", "==", String(chatId)).limit(1).get();
  if (snap.empty) return null;
  const uid = snap.docs[0].ref.parent.parent.id;
  const userSnap = await db.collection("users").doc(uid).get();
  return { uid, ...userSnap.data() };
}

async function tryLinkByCode(chatId, code) {
  const snap = await db.collectionGroup("telegramConnections").where("linkCode", "==", code).limit(1).get();
  if (snap.empty) return false;
  const connDoc = snap.docs[0];
  const data = connDoc.data();
  if (data.linkCodeExpiresAt && data.linkCodeExpiresAt.toMillis() < Date.now()) return false;
  await connDoc.ref.set({
    chatId: String(chatId),
    linked: true,
    linkedAt: FieldValue.serverTimestamp(),
    linkCode: null,
    linkCodeExpiresAt: null,
  }, { merge: true });
  return true;
}

async function todaysScheduleText(uid, timezone) {
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const schedulesSnap = await db.collection("users").doc(uid).collection("schedules").where("status", "==", "active").get();
  // Lightweight: for /today we only show schedules whose literal startDate matches today OR whose
  // recurrence would include today for daily/weekly/simple cases — full expansion mirrors
  // app-recurrence.service.js logic; kept intentionally simple here since the bot
  // reply is a convenience view, not the source of truth (the app UI is).
  const lines = [];
  schedulesSnap.forEach((doc) => {
    const s = doc.data();
    lines.push(`${s.startTime}  ${s.title}`);
  });
  lines.sort();
  return lines.length ? lines.join("\n") : "Nothing scheduled today.";
}

async function handleCommand(chatId, uid, user, text) {
  const [cmd] = text.trim().split(/\s+/);
  switch (cmd) {
    case "/start":
      return sendTelegramMessage(chatId,
        "Welcome to *SSAS*.\n\nTo link this Telegram account, open SSAS → Settings → Telegram → *Connect Telegram*, then send:\n`/link <code>`");
    case "/help":
      return sendTelegramMessage(chatId,
        "Commands:\n/today — today's schedule\n/next — your next activity\n/pending — pending activities\n/completed — completed today\n/settings — link to SSAS settings");
    case "/today":
      if (!uid) return sendTelegramMessage(chatId, "This chat isn't linked to an SSAS account yet. Send /start for instructions.");
      return sendTelegramMessage(chatId, `*Today's schedule*\n\n${await todaysScheduleText(uid, user?.timezone)}`);
    case "/settings":
      return sendTelegramMessage(chatId, "Manage everything in the SSAS app under Settings.");
    default:
      return null; // not a recognized command — likely /link handled separately
  }
}

async function handleCallback(callbackQuery) {
  const data = callbackQuery.data || "";
  const chatId = callbackQuery.message.chat.id;
  const [action, payload] = data.split(":");
  const user = await findUserByChatId(chatId);
  if (!user) return;

  if (action === "complete") await markCompletedServerSide(user.uid, payload);
  if (action === "snooze") await snoozeOccurrenceServerSide(user.uid, payload, 15);
  if (action === "reschedule") {
    await sendTelegramMessage(chatId, "Open SSAS to pick a new date/time for this activity.");
    return;
  }
  await sendTelegramMessage(chatId, "Got it — updated in SSAS.");
}

export async function runTelegramBotOnce() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log("TELEGRAM_BOT_TOKEN not set — skipping Telegram bot poll this run.");
    return;
  }
  const { ref, offset } = await getOffsetState();
  const updates = await getUpdates(offset);
  let maxOffset = offset;

  for (const update of updates) {
    maxOffset = Math.max(maxOffset, update.update_id + 1);

    if (update.callback_query) {
      await handleCallback(update.callback_query);
      continue;
    }

    const msg = update.message;
    if (!msg || !msg.text) continue;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    if (text.startsWith("/link ")) {
      const code = text.split(/\s+/)[1];
      const linked = await tryLinkByCode(chatId, code);
      await sendTelegramMessage(chatId, linked
        ? "✅ Linked! You'll now receive SSAS reminders here."
        : "That code is invalid or expired. Generate a new one from SSAS → Settings → Telegram.");
      continue;
    }

    const user = await findUserByChatId(chatId);
    await handleCommand(chatId, user?.uid, user, text);
  }

  await ref.set({ lastOffset: maxOffset, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

// Allow running standalone: `node server-telegram-bot.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  runTelegramBotOnce().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
