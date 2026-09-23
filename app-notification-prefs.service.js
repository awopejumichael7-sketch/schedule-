import { db, auth } from "./app-firebase-init.js";
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const DEFAULTS = {
  push: true, email: true, telegram: false, googleCalendar: false,
  dailyEmailDigest: false, weeklyEmailDigest: true, monthlyEmailDigest: true,
};

export async function getNotificationPrefs() {
  const ref = doc(db, "users", auth.currentUser.uid, "notificationPreferences", "settings");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, DEFAULTS);
    return DEFAULTS;
  }
  return snap.data();
}

export async function updateNotificationPrefs(patch) {
  const ref = doc(db, "users", auth.currentUser.uid, "notificationPreferences", "settings");
  await setDoc(ref, patch, { merge: true });
}

export async function registerDevice(fcmToken, platform) {
  await addDoc(collection(db, "users", auth.currentUser.uid, "devices"), {
    fcmToken, platform, createdAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
  });
}

export async function updateAccountabilitySettings(patch) {
  const ref = doc(db, "users", auth.currentUser.uid);
  await updateDoc(ref, { accountability: patch, updatedAt: serverTimestamp() });
}
