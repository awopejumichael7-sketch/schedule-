// google-calendar-sync.js — server-side half of Google Calendar
// integration (§4, §49, §72). Runs with the Admin SDK's trusted
// environment, so it's the only place the OAuth Client Secret and users'
// refresh tokens are ever handled.

import { google } from "googleapis";
import { db, FieldValue } from "./server-firebase-admin-init.js";

function oauthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — see GOOGLE-CALENDAR.md.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, "postmessage"); // "postmessage" for popup code flow
}

/**
 * Step 2 of the OAuth flow (step 1 is the browser popup — see
 * app-google-calendar.service.js). Exchanges the one-time
 * authorization code for access + refresh tokens and stores the refresh
 * token server-side only.
 */
export async function exchangePendingAuthCodes() {
  const pendingSnap = await db.collectionGroup("calendarConnections")
    .where("pendingAuthCode", "!=", null)
    .get();

  for (const docSnap of pendingSnap.docs) {
    const uid = docSnap.ref.parent.parent.id;
    const { pendingAuthCode } = docSnap.data();
    try {
      const client = oauthClient();
      const { tokens } = await client.getToken(pendingAuthCode);
      client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: "v2", auth: client });
      const { data: profile } = await oauth2.userinfo.get();

      await docSnap.ref.set({
        provider: "google",
        connected: true,
        googleAccountEmail: profile.email,
        refreshToken: tokens.refresh_token, // only ever written here, server-side
        accessTokenExpiresAt: new Date(tokens.expiry_date),
        selectedCalendarId: "primary",
        lastSyncedAt: null,
        syncStatus: "ok",
        pendingAuthCode: FieldValue.delete(),
        pendingAuthRequestedAt: FieldValue.delete(),
      }, { merge: true });

      console.log(`Google Calendar connected for user ${uid} (${profile.email})`);
    } catch (err) {
      console.error(`Google OAuth exchange failed for user ${uid}:`, err.message);
      await docSnap.ref.set({
        syncStatus: "needs_attention",
        pendingAuthCode: FieldValue.delete(),
      }, { merge: true });
    }
  }
}

function authorizedClientFor(connection) {
  const client = oauthClient();
  client.setCredentials({ refresh_token: connection.refreshToken });
  return client;
}

/**
 * Creates/updates/deletes the Google Calendar event mirroring an SSAS
 * occurrence, and stores the mapping (§4 — "Store the relationship
 * between SSAS schedule ID and Google Calendar event ID").
 */
export async function syncOccurrenceToGoogle(uid, connection, schedule, occurrence) {
  if (!connection?.connected || !schedule.googleCalendarEnabled) return;

  const client = authorizedClientFor(connection);
  const calendar = google.calendar({ version: "v3", auth: client });
  const calendarId = connection.selectedCalendarId || "primary";

  const startISO = new Date(occurrence.scheduledStart).toISOString();
  const endISO = schedule.durationMinutes
    ? new Date(new Date(occurrence.scheduledStart).getTime() + schedule.durationMinutes * 60000).toISOString()
    : new Date(new Date(occurrence.scheduledStart).getTime() + 30 * 60000).toISOString();

  const eventBody = {
    summary: schedule.title,
    description: schedule.description || "",
    location: schedule.location || "",
    start: { dateTime: startISO, timeZone: schedule.timezone },
    end: { dateTime: endISO, timeZone: schedule.timezone },
  };

  try {
    if (occurrence.status === "cancelled" || occurrence.status === "skipped") {
      if (occurrence.googleEventId) {
        await calendar.events.delete({ calendarId, eventId: occurrence.googleEventId }).catch(() => {});
      }
      return null;
    }

    if (occurrence.googleEventId) {
      await calendar.events.update({ calendarId, eventId: occurrence.googleEventId, requestBody: eventBody });
      return occurrence.googleEventId;
    } else {
      const { data } = await calendar.events.insert({ calendarId, requestBody: eventBody });
      return data.id;
    }
  } catch (err) {
    if (err.code === 401 || err.code === 403) {
      await db.collection("users").doc(uid).collection("calendarConnections").doc("google")
        .set({ syncStatus: "needs_attention" }, { merge: true });
    }
    console.error(`Google Calendar sync failed for user ${uid}:`, err.message);
    return null;
  }
}

export async function markSyncCompleted(uid) {
  await db.collection("users").doc(uid).collection("calendarConnections").doc("google").set({
    lastSyncedAt: FieldValue.serverTimestamp(),
    syncStatus: "ok",
    syncRequestedAt: FieldValue.delete(),
  }, { merge: true });
}
