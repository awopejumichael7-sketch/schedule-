// Firebase Web SDK config.
// These values are NOT secrets — they identify your Firebase project the
// same way a URL does. Security is enforced by firestore.rules, not by
// hiding these. Get them from: Firebase Console → Project Settings →
// "Your apps" → Web app.
//
// See DEPLOYMENT.md §2.

export const firebaseConfig = {
  apiKey: "AIzaSyASpQ_H_wDS-0yHdOlF0PQsfNz2qagfBtk",
    authDomain: "sass-fdea0.firebaseapp.com",
    projectId: "sass-fdea0",
    storageBucket: "sass-fdea0.firebasestorage.app",
    messagingSenderId: "594232822730",
    appId: "1:594232822730:web:ffa02a88bc33c85aa71d33",
};

// Google OAuth Client ID (public — the secret half lives server-side only,
// see GOOGLE-CALENDAR.md).
export const GOOGLE_OAUTH_CLIENT_ID = "REPLACE_WITH_YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com";
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

// FCM Web Push VAPID key (public key half — generate free in Firebase
// Console → Project Settings → Cloud Messaging → Web configuration).
export const FCM_VAPID_KEY = "REPLACE_WITH_YOUR_VAPID_KEY";
