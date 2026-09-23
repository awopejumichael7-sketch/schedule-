// firebase-admin-init.js
//
// Shared Admin SDK bootstrap for every server-side script. The Admin SDK
// authenticates with a service account and BYPASSES Firestore Security
// Rules entirely (that's expected and safe here — these scripts only ever
// run in the trusted GitHub Actions environment, never in the browser).
//
// Credential source: the FIREBASE_SERVICE_ACCOUNT_JSON environment
// variable, expected to contain the full service account JSON as a
// single-line string (GitHub Actions secrets store strings, not files —
// see DEPLOYMENT.md §6 for exactly how to generate and paste this).
//
// IMPORTANT: this file deliberately throws loudly if the credential is
// missing, rather than silently no-op'ing — a silent no-op here would
// mean reminders/accountability checks quietly stop firing, which is far
// worse than a visible CI failure.

import admin from "firebase-admin";

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not set. See DEPLOYMENT.md §6 " +
      "for how to generate a Firebase service account key and add it as a " +
      "GitHub Actions secret."
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: " + err.message);
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
  });
}

export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
export { admin };
