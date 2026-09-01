"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Store name is required").max(200),
  domain: z.string().trim().max(255).nullable(),
  notificationEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(255).email().nullable()
  ),
  notificationSenderName: z.string().trim().max(100).nullable(),
});

export async function updateStoreSettings(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const nameRaw = (formData.get("name") as string)?.trim() ?? "";
    const domainRaw = (formData.get("domain") as string)?.trim() ?? "";
    const domainCleaned = domainRaw.replace(/^https?:\/\//, "").replace(/\/$/, "") || null;
    const notificationEmailRaw = (formData.get("notification_email") as string)?.trim() ?? "";
    const notificationSenderNameRaw = (formData.get("notification_sender_name") as string)?.trim() || null;

    const {
      name,
      domain,
      notificationEmail,
      notificationSenderName,
    } = validate(settingsSchema, {
      name: nameRaw,
      domain: domainCleaned,
      notificationEmail: notificationEmailRaw,
      notificationSenderName: notificationSenderNameRaw,
    });
    const { error } = await supabaseAdmin
      .from("stores")
      .update({
        name,
        domain,
        notification_email: notificationEmail,
        notification_sender_name: notificationSenderName,
      })
      .eq("id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/market/delivery-markets");
    revalidatePath("/dashboard/market/xml-feed-urls");
    revalidatePath("/dashboard");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
