import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendPushToUser } from "@/lib/push";

/**
 * Records a notification (feeds the storefront's notification bell/history,
 * readable even if the push never arrived — permission denied, browser
 * closed, subscription expired) and, best-effort, sends a live browser push
 * alongside it. Never throws — a notification failing must never fail the
 * action that triggered it (e.g. an escrow status change still succeeds
 * even if both the DB insert and the push fail).
 */
export async function notifyUser(
  storeId: string,
  userId: string,
  notification: { type: string; title: string; body: string; linkPath?: string | null }
): Promise<void> {
  try {
    await supabaseAdmin.from("notifications").insert({
      store_id: storeId,
      user_id: userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link_path: notification.linkPath ?? null,
    });
  } catch {
    // best-effort
  }

  await sendPushToUser(storeId, userId, {
    title: notification.title,
    body: notification.body,
    url: notification.linkPath ?? undefined,
  });
}
