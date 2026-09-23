// push.service.js — Firebase Cloud Messaging via the Admin SDK (§10, free
// on Spark plan — FCM sending is not gated behind Blaze).
import { db, admin } from "./server-firebase-admin-init.js";

export async function sendPushToUser(uid, { title, body, route, occurrenceId }) {
  const devicesSnap = await db.collection("users").doc(uid).collection("devices").get();
  if (devicesSnap.empty) return { ok: false, error: "No registered devices" };

  const tokens = devicesSnap.docs.map((d) => d.data().fcmToken).filter(Boolean);
  if (!tokens.length) return { ok: false, error: "No FCM tokens" };

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { route: route || "/dashboard", occurrenceId: occurrenceId || "" },
      webpush: {
        fcmOptions: { link: `/index.html#${route || "/dashboard"}` },
        notification: { icon: "/icon-192.png" },
      },
    });

    // Clean up tokens that are no longer valid (uninstalled app, expired, etc.)
    const invalidTokens = [];
    response.responses.forEach((r, i) => {
      if (!r.success && ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(r.error?.code)) {
        invalidTokens.push(tokens[i]);
      }
    });
    if (invalidTokens.length) {
      const toDelete = devicesSnap.docs.filter((d) => invalidTokens.includes(d.data().fcmToken));
      await Promise.all(toDelete.map((d) => d.ref.delete()));
    }

    return { ok: response.successCount > 0, successCount: response.successCount, failureCount: response.failureCount };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
