"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import type { InquiryStatus } from "@/lib/types";

const inquiryStatusSchema = z.enum(["open", "closed"]);

export async function setInquiryStatus(inquiryId: string, status: InquiryStatus): Promise<ActionResult> {
  try {
    inquiryId = validateId(inquiryId);
    status = validate(inquiryStatusSchema, status);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("inquiries")
      .update({ status })
      .eq("id", inquiryId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/inquiries");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function deleteInquiry(inquiryId: string): Promise<ActionResult> {
  try {
    inquiryId = validateId(inquiryId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("inquiries")
      .delete()
      .eq("id", inquiryId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/inquiries");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
