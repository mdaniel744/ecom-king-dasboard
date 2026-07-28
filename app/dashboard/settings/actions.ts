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
  googleFeedLabels: z.array(z.string().trim().min(2).max(10)).max(50),
  productUrlPath: z
    .string()
    .trim()
    .min(1, "Product page path is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/i, "Use only letters, numbers, and hyphens — no slashes or spaces"),
  sourceLocaleHasPrefix: z.boolean(),
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
    const googleFeedLabelsRaw = formData.getAll("google_feed_labels") as string[];
    // google_feed_label (singular) has no form field of its own anymore —
    // Delivery Markets is the single source of truth in the UI. Derive it
    // as "the primary market" for the legacy column (still read by the XML
    // feed route), defaulting to the store's current value, then "US" only
    // if that's also somehow unset.
    const googleFeedLabelRaw = googleFeedLabelsRaw[0] || store.google_feed_label || "US";
    const productUrlPathRaw = (formData.get("product_url_path") as string)?.trim() || "products";
    const sourceLocaleHasPrefixRaw = formData.get("source_locale_has_prefix") === "on";
    const enabledLocalesRaw = formData.getAll("enabled_locales") as string[];
    const notificationEmailRaw = (formData.get("notification_email") as string)?.trim() ?? "";

    const {
      name,
      domain,
      googleMerchantId,
      googleMerchantDatasourceId,
      googleContentLanguage,
      googleFeedLabel,
      googleFeedLabels,
      productUrlPath,
      sourceLocaleHasPrefix,
      enabledLocales,
      notificationEmail,
    } = validate(settingsSchema, {
      name: nameRaw,
      domain: domainCleaned,
      googleMerchantId: googleMerchantIdRaw,
      googleMerchantDatasourceId: googleMerchantDatasourceIdRaw,
      googleContentLanguage: googleContentLanguageRaw,
      googleFeedLabel: googleFeedLabelRaw,
      googleFeedLabels: googleFeedLabelsRaw.length > 0 ? googleFeedLabelsRaw : [googleFeedLabelRaw],
      productUrlPath: productUrlPathRaw,
      sourceLocaleHasPrefix: sourceLocaleHasPrefixRaw,
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
        google_feed_labels: googleFeedLabels,
        product_url_path: productUrlPath,
        source_locale_has_prefix: sourceLocaleHasPrefix,
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
