import "server-only";
import { createClerkClient } from "@clerk/backend";

let client: ReturnType<typeof createClerkClient> | null = null;

/**
 * Kariv's own dealer/buyer-facing Clerk app — separate from this dashboard's
 * staff Clerk instance. Only Kariv has this configured today (no other
 * store has a buyer/dealer marketplace), same as KARIV_DEALER_CLERK_SECRET_KEY's
 * other use in app/dashboard/dealer-applications/actions.ts.
 */
function getKarivClerk() {
  if (client) return client;
  const secretKey = process.env.KARIV_DEALER_CLERK_SECRET_KEY;
  if (!secretKey) return null;
  client = createClerkClient({ secretKey });
  return client;
}

export type KarivUserInfo = { name: string; email: string | null };

function shapeUser(user: { firstName: string | null; lastName: string | null; username: string | null; id: string; primaryEmailAddress: { emailAddress: string } | null }): KarivUserInfo {
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.username ||
    user.primaryEmailAddress?.emailAddress ||
    user.id;
  return { name, email: user.primaryEmailAddress?.emailAddress ?? null };
}

/**
 * Batch-resolves Clerk user IDs (buyer_user_id, dealer_user_id) to a
 * display name + email — best-effort: missing/failed lookups are simply
 * absent from the returned map, so callers should fall back to the raw ID.
 */
export async function getKarivUsersByIds(userIds: string[]): Promise<Map<string, KarivUserInfo>> {
  const map = new Map<string, KarivUserInfo>();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return map;

  const clerk = getKarivClerk();
  if (!clerk) return map;

  try {
    const { data } = await clerk.users.getUserList({ userId: uniqueIds, limit: uniqueIds.length });
    for (const user of data) {
      map.set(user.id, shapeUser(user));
    }
  } catch {
    // best-effort — UI falls back to showing the raw Clerk ID
  }
  return map;
}
