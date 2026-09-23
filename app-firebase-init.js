// Central Firebase initialization. Every other module imports auth/db from
// here so there is exactly one app instance.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getMessaging, isSupported as messagingIsSupported } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";
import { firebaseConfig } from "./app-firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Offline support (§35): Firestore's built-in local cache lets reads/writes
// keep working offline and sync automatically on reconnect. Conflicts use
// Firestore's default last-write-wins per field, which is acceptable for
// single-user-editing-their-own-data semantics.
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Offline persistence disabled: multiple tabs open.");
  } else if (err.code === "unimplemented") {
    console.warn("Offline persistence not supported in this browser.");
  }
});

// Messaging is optional — not all browsers/contexts support it (e.g. iOS
// Safari support is limited/version-dependent). Callers must check first.
export async function getMessagingIfSupported() {
  if (await messagingIsSupported()) {
    return getMessaging(app);
  }
  return null;
}

// Local emulator support for development (TESTING.md).
if (location.hostname === "localhost" && location.port === "5000" && window.__USE_EMULATORS__) {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
}
