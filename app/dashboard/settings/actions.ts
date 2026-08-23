"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { checkProductLinks, type LinkCheckResult } from "@/lib/google-merchant";
import type { Product } from "@/lib/types";

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
  vatRates: z.record(z.string(), z.number().min(0).max(100)),
  enabledLocales: z.array(z.string().trim().min(2).max(10)).max(20),
  googlePushLocales: z.array(z.string().trim().min(2).max(10)).max(20),
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
    // Only markets actually checked in this submission get a VAT rate --
    // an empty/invalid value for a checked market just means "no VAT for
    // this market" (matches the field's own placeholder behavior), not a
    // validation error, since leaving it blank is a deliberate valid choice.
    const vatRatesRaw: Record<string, number> = {};
    for (const market of googleFeedLabelsRaw) {
      const raw = (formData.get(`vat_rate_${market}`) as string)?.trim();
      if (!raw) continue;
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
        vatRatesRaw[market] = parsed;
      }
    }
    const enabledLocalesRaw = formData.getAll("enabled_locales") as string[];
    // Only checkboxes for currently-enabled locales are ever rendered, but
    // clamp here too in case enabledLocales was narrowed in the same submit
    // (a stale push-locale value shouldn't survive its translation target
    // being unchecked in the same save).
    const googlePushLocalesRaw = (formData.getAll("google_push_locales") as string[]).filter((l) =>
      enabledLocalesRaw.includes(l)
    );
    const notificationEmailRaw = (formData.get("notification_email") as string)?.trim() ?? "";
    const notificationSenderNameRaw = (formData.get("notification_sender_name") as string)?.trim() || null;

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
      vatRates,
      enabledLocales,
      googlePushLocales,
      notificationEmail,
      notificationSenderName,
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
      vatRates: vatRatesRaw,
      enabledLocales: enabledLocalesRaw,
      googlePushLocales: googlePushLocalesRaw,
      notificationEmail: notificationEmailRaw,
      notificationSenderName: notificationSenderNameRaw,
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
        vat_rates: vatRates,
        enabled_locales: enabledLocales,
        google_push_locales: googlePushLocales,
        notification_email: notificationEmail,
        notification_sender_name: notificationSenderName,
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

/**
 * Live-checks every market x locale product link this store is configured
 * for, against one real product, so a broken Product Page Word / Language
 * Prefix setting is caught by clicking a button in Settings instead of by a
 * customer (or colleague) hitting a 404 from Google.
 */
export async function testProductLinks(): Promise<ActionResult<LinkCheckResult[]>> {
  try {
    const store = await getCurrentStore();
    if (!store.domain) {
      return { success: false, error: "Add your store's domain above before testing links.", fieldErrors: {} };
    }

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (!product) {
      return {
        success: false,
        error: "No active product found to test links against — add or activate one first.",
        fieldErrors: {},
      };
    }

    const results = await checkProductLinks(store, product as Product);
    return ok(results);
  } catch (err) {
    return toActionResult(err);
  }
}
