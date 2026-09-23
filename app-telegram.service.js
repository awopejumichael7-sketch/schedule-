// telegram.service.js — client half of Telegram linking (§9, §73).
//
// The bot token never touches this file. The linking flow is:
//   1. Client requests a link code (a random 6-digit code, written to
//      users/{uid}/telegramConnections/primary.linkCode, expires in 10 min).
//   2. User opens Telegram, starts the SSAS bot, sends "/link 123456".
//   3. server-telegram-bot.js (holds the real bot token, server-side)
//      looks up which user requested that code and writes chatId + linked:true
//      — a field the client is NOT allowed to write itself (see rules).
import { db, auth } from "./app-firebase-init.js";
import { doc, setDoc, onSnapshot, updateDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function requestTelegramLinkCode() {
  const uidVal = auth.currentUser.uid;
  const code = randomCode();
  await setDoc(doc(db, "users", uidVal, "telegramConnections", "primary"), {
    linkCode: code,
    linkCodeExpiresAt: Timestamp.fromMillis(Date.now() + 10 * 60000),
    linked: false,
  }, { merge: true });
  return code;
}

export function watchTelegramStatus(callback) {
  const uidVal = auth.currentUser.uid;
  return onSnapshot(doc(db, "users", uidVal, "telegramConnections", "primary"), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

export async function disconnectTelegram() {
  const uidVal = auth.currentUser.uid;
  await updateDoc(doc(db, "users", uidVal, "telegramConnections", "primary"), {
    linked: false,
    linkCode: null,
  });
}

// "Test notification" just enqueues a one-off notification the engine will
// pick up on its next 5-minute run and send via the bot (§9 test message).
export async function sendTestTelegramNotification() {
  const uidVal = auth.currentUser.uid;
  await setDoc(doc(db, "users", uidVal, "notifications", `test:${Date.now()}`), {
    occurrenceId: null,
    scheduleId: null,
    channel: "telegram",
    scheduledFor: serverTimestamp(),
    status: "queued",
    attempt: 0,
    testMessage: "SSAS Telegram notification is working successfully.",
  });
}
