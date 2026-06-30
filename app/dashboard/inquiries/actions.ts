"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { InquiryStatus } from "@/lib/types";

export async function setInquiryStatus(inquiryId: string, status: InquiryStatus) {
  const store = await getCurrentStore();

  const { error } = await supabaseAdmin
    .from("inquiries")
    .update({ status })
    .eq("id", inquiryId)
    .eq("store_id", store.id);

  if (error) throw new Error(`Failed to update inquiry: ${error.message}`);

  revalidatePath("/dashboard/inquiries");
}

export async function deleteInquiry(inquiryId: string) {
  const store = await getCurrentStore();

  const { error } = await supabaseAdmin
    .from("inquiries")
    .delete()
    .eq("id", inquiryId)
    .eq("store_id", store.id);

  if (error) throw new Error(`Failed to delete inquiry: ${error.message}`);

  revalidatePath("/dashboard/inquiries");
}
