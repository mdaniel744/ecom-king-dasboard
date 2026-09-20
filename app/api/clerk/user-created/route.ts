import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * Clerk webhook -- fires on every new Clerk user, not just invited ones.
 * Only acts when the user's publicMetadata carries a pendingStoreInvite
 * (set by inviteTeammate in app/dashboard/settings/team-actions.ts when
 * inviting someone with no existing account). Clerk copies an invitation's
 * publicMetadata onto the resulting User the moment they accept and sign
 * up, which is what makes this the actual "the invite is now real" step --
 * there is no team-membership row for this person before this fires.
 */
export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  if (event.type !== "user.created") {
    return NextResponse.json({ ok: true, skipped: "wrong_event_type" });
  }

  const pendingInvite = event.data.public_metadata?.pendingStoreInvite as
    | { storeId?: string; role?: string }
    | undefined;

  if (!pendingInvite?.storeId || !pendingInvite.role) {
    return NextResponse.json({ ok: true, skipped: "no_pending_invite" });
  }

  const { error } = await supabaseAdmin.from("store_members").upsert(
    {
      store_id: pendingInvite.storeId,
      user_id: event.data.id,
      role: pendingInvite.role,
    },
    { onConflict: "store_id,user_id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("Failed to create store_members row from Clerk invite:", error);
    return NextResponse.json({ error: "Failed to add teammate" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
