// googleCalendar.service.js
//
// Client-side half of Google Calendar integration (§4, §49, §72).
//
// Flow:
//  1. Browser uses Google Identity Services (GIS) to open the OAuth
//     consent popup with the MINIMAL scope (calendar.events only).
//  2. GIS returns an authorization CODE (not a token) when using the
//     `ux_mode: "popup"` code-flow — this code is single-use and must be
//     exchanged for tokens. The exchange requires the OAuth Client
//     SECRET, which must never touch the browser (§72, §41 SECURITY.md).
//  3. The code is written to a short-lived pending-auth doc; the
//     server-side script (server-telegram-bot.js's sibling,
//     server-google-calendar-sync.js — see GOOGLE-CALENDAR.md)
//     performs the actual code→token exchange using the Admin SDK and
//     writes the resulting refresh token to
//     users/{uid}/calendarConnections/google, which client rules forbid
//     the browser from writing to directly.
//
// This keeps the Client Secret server-side while still giving a snappy
// popup-based consent UX.

import { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_CALENDAR_SCOPE } from "./app-firebase-config.js";
import { db, auth } from "./app-firebase-init.js";
import { doc, setDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let gisLoaded = false;
function loadGis() {
  if (gisLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => { gisLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export async function connectGoogleCalendar() {
  await loadGis();
  const uidVal = auth.currentUser.uid;

  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scope: GOOGLE_CALENDAR_SCOPE,
      ux_mode: "popup",
      access_type: "offline", // required to receive a refresh token
      prompt: "consent",
      callback: async (response) => {
        if (response.error) return reject(new Error(response.error));
        // Hand the one-time code to the pending-auth doc for the backend
        // exchange script to pick up. Rules allow a user to write ONLY
        // this pending-code field for themselves.
        await setDoc(doc(db, "users", uidVal, "calendarConnections", "google"), {
          provider: "google",
          connected: false,
          pendingAuthCode: response.code,
          pendingAuthRequestedAt: serverTimestamp(),
          syncStatus: "never_synced",
        }, { merge: true });
        resolve();
      },
    });
    client.requestCode();
  });
}

export function watchGoogleCalendarStatus(callback) {
  const uidVal = auth.currentUser.uid;
  return onSnapshot(doc(db, "users", uidVal, "calendarConnections", "google"), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

export async function disconnectGoogleCalendar() {
  const uidVal = auth.currentUser.uid;
  await updateDoc(doc(db, "users", uidVal, "calendarConnections", "google"), {
    connected: false,
    updatedAt: serverTimestamp(),
  });
}

export async function selectCalendar(calendarId) {
  const uidVal = auth.currentUser.uid;
  await updateDoc(doc(db, "users", uidVal, "calendarConnections", "google"), {
    selectedCalendarId: calendarId,
    updatedAt: serverTimestamp(),
  });
}

// "Sync now" just writes a request flag; the actual API calls (create/
// update/delete Google events, per GOOGLE-CALENDAR.md) happen
// server-side in the reminder engine run, using the stored refresh token
// via the Admin SDK + googleapis client — never from the browser, since
// the browser never holds a long-lived Google access token for this app.
export async function requestSyncNow() {
  const uidVal = auth.currentUser.uid;
  await updateDoc(doc(db, "users", uidVal, "calendarConnections", "google"), {
    syncRequestedAt: serverTimestamp(),
  });
}
