import "server-only";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase-admin";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    throw new Error("VAPID keys are not configured — push notifications are unavailable.");
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
}

/**
 * Sends a browser push notification to every subscription on file for this
 * user (they may have granted permission on more than one device/browser).
 * Best-effort per subscription: a dead/expired subscription (HTTP 404/410
 * from the push service) is deleted so it stops being retried forever;
 * any other failure is swallowed so one bad subscription can't block the
 * rest, and this never throws back to the caller (a push failing must
 * never fail the underlying action, e.g. an escrow status change).
 */
export async function sendPushToUser(
  storeId: string,
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  try {
    ensureConfigured();
  } catch {
    return;
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("store_id", storeId)
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
        }
        // any other error: best-effort, don't propagate
      }
    })
  );
}
