// Firebase Web SDK config.
// These values are NOT secrets — they identify your Firebase project the
// same way a URL does. Security is enforced by firestore.rules, not by
// hiding these. Get them from: Firebase Console → Project Settings →
// "Your apps" → Web app.
//
// See DEPLOYMENT.md §2.

export const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID",
};

// Google OAuth Client ID (public — the secret half lives server-side only,
// see GOOGLE-CALENDAR.md).
export const GOOGLE_OAUTH_CLIENT_ID = "REPLACE_WITH_YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com";
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

// FCM Web Push VAPID key (public key half — generate free in Firebase
// Console → Project Settings → Cloud Messaging → Web configuration).
export const FCM_VAPID_KEY = "REPLACE_WITH_YOUR_VAPID_KEY";
