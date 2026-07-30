"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import type { DealerApplicationStatus } from "@/lib/types";

// No create action here — applications are inserted by the storefront's
// own dealer application form (anon key, insert-only, same pattern as
// inquiries). This file is the staff-side review flow only.

async function setStatus(applicationId: string, status: DealerApplicationStatus): Promise<ActionResult> {
  try {
    applicationId = validateId(applicationId);
    const store = await getCurrentStore();
    const { userId } = await auth();

    const { error } = await supabaseAdmin
      .from("dealer_applications")
      .update({ status, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", applicationId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/dealer-applications");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function approveDealerApplication(applicationId: string): Promise<ActionResult> {
  return setStatus(applicationId, "approved");
}

export async function rejectDealerApplication(applicationId: string): Promise<ActionResult> {
  return setStatus(applicationId, "rejected");
}
