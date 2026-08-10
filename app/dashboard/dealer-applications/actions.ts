"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createClerkClient } from "@clerk/backend";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validateId, ValidationError } from "@/lib/validation";
import { ok, type ActionResult } from "@/lib/action-result";
import type { DealerApplicationStatus } from "@/lib/types";

// No create action here — applications are inserted by the storefront's
// own dealer application form (anon key, insert-only, same pattern as
// inquiries). This file is the staff-side review flow only.

/**
 * Grants the "dealer" role on Kariv's own dealer-facing Clerk app — a
 * separate Clerk instance from this dashboard's own staff login. Only
 * Kariv has this configured today (no other store has a dealer
 * marketplace), so a missing key here is a real config gap, not a bug.
 */
async function grantDealerRole(dealerUserId: string): Promise<void> {
  const secretKey = process.env.KARIV_DEALER_CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Dealer Clerk integration is not configured (KARIV_DEALER_CLERK_SECRET_KEY missing).");
  }
  const dealerClerk = createClerkClient({ secretKey });
  await dealerClerk.users.updateUserMetadata(dealerUserId, {
    publicMetadata: { role: "dealer" },
  });
}

async function setStatus(applicationId: string, status: DealerApplicationStatus): Promise<ActionResult> {
  try {
    applicationId = validateId(applicationId);
    const store = await getCurrentStore();
    const { userId } = await auth();

    if (status === "approved") {
      // Grant the Clerk role FIRST, before touching Supabase — if this
      // fails, the application stays "pending" so staff can just retry,
      // instead of the DB silently saying "approved" while the applicant
      // never actually got dealer access (the exact bug this replaces).
      const { data: application, error: fetchError } = await supabaseAdmin
        .from("dealer_applications")
        .select("dealer_user_id")
        .eq("id", applicationId)
        .eq("store_id", store.id)
        .single();
      if (fetchError || !application) {
        return { success: false, error: "Application not found.", fieldErrors: {} };
      }

      await grantDealerRole(application.dealer_user_id);
    }

    const { error } = await supabaseAdmin
      .from("dealer_applications")
      .update({ status, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", applicationId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/dealer-applications");
    return ok();
  } catch (err) {
    if (err instanceof ValidationError) {
      return { success: false, error: err.message, fieldErrors: err.fieldErrors };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Something went wrong saving this. Please try again.",
      fieldErrors: {},
    };
  }
}

export async function approveDealerApplication(applicationId: string): Promise<ActionResult> {
  return setStatus(applicationId, "approved");
}

export async function rejectDealerApplication(applicationId: string): Promise<ActionResult> {
  return setStatus(applicationId, "rejected");
}
