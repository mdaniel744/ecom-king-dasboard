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
  googleMerchantId: z.string().trim().max(100).nullable(),
  googleMerchantDatasourceId: z.string().trim().max(100).nullable(),
  googleContentLanguage: z.string().trim().min(2).max(10),
  googleFeedLabel: z.string().trim().min(2).max(10),
  enabledLocales: z.array(z.string().trim().min(2).max(10)).max(20),
  notificationEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(255).email().nullable()
  ),
});

export async function updateStoreSettings(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const nameRaw = (formData.get("name") as string)?.trim() ?? "";
    const domainRaw = (formData.get("domain") as string)?.trim() ?? "";
    const domainCleaned = domainRaw.replace(/^https?:\/\//, "").replace(/\/$/, "") || null;
    const googleMerchantIdRaw = (formData.get("google_merchant_id") as string)?.trim() || null;
    const googleMerchantDatasourceIdRaw =
      (formData.get("google_merchant_datasource_id") as string)?.trim() || null;
    const googleContentLanguageRaw =
      (formData.get("google_content_language") as string)?.trim() || "en";
    const googleFeedLabelRaw = (formData.get("google_feed_label") as string)?.trim() || "US";
    const enabledLocalesRaw = formData.getAll("enabled_locales") as string[];
    const notificationEmailRaw = (formData.get("notification_email") as string)?.trim() ?? "";

    const {
      name,
      domain,
      googleMerchantId,
      googleMerchantDatasourceId,
      googleContentLanguage,
      googleFeedLabel,
      enabledLocales,
      notificationEmail,
    } = validate(settingsSchema, {
      name: nameRaw,
      domain: domainCleaned,
      googleMerchantId: googleMerchantIdRaw,
      googleMerchantDatasourceId: googleMerchantDatasourceIdRaw,
      googleContentLanguage: googleContentLanguageRaw,
      googleFeedLabel: googleFeedLabelRaw,
      enabledLocales: enabledLocalesRaw,
      notificationEmail: notificationEmailRaw,
    });
    const { error } = await supabaseAdmin
      .from("stores")
      .update({
        name,
        domain,
        google_merchant_id: googleMerchantId,
        google_merchant_datasource_id: googleMerchantDatasourceId,
        google_content_language: googleContentLanguage,
        google_feed_label: googleFeedLabel,
        enabled_locales: enabledLocales,
        notification_email: notificationEmail,
      })
      .eq("id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
