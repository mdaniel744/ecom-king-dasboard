"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { checkProductLinks, type LinkCheckResult } from "@/lib/google-merchant";
import type { Product } from "@/lib/types";

const googleMerchantSchema = z.object({
  googleMerchantId: z.string().trim().max(100).nullable(),
  googleMerchantDatasourceId: z.string().trim().max(100).nullable(),
  googleContentLanguage: z.string().trim().min(2).max(10),
  enabledLocales: z.array(z.string().trim().min(2).max(10)).max(20),
  googlePushLocales: z.array(z.string().trim().min(2).max(10)).max(20),
});

const deliveryMarketsSchema = z.object({
  googleFeedLabel: z.string().trim().min(2).max(10),
  googleFeedLabels: z.array(z.string().trim().min(2).max(10)).max(50),
  productUrlPath: z
    .string()
    .trim()
    .min(1, "Product page path is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/i, "Use only letters, numbers, and hyphens — no slashes or spaces"),
  sourceLocaleHasPrefix: z.boolean(),
  productUrlPathOverrides: z.record(
    z.string(),
    z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/i, "Use only letters, numbers, and hyphens")
  ),
  vatRates: z.record(z.string(), z.number().min(0).max(100)),
});

export async function updateGoogleMerchantSettings(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const enabledLocalesRaw = formData.getAll("enabled_locales") as string[];
    const googlePushLocalesRaw = (formData.getAll("google_push_locales") as string[]).filter(
      (locale) => enabledLocalesRaw.includes(locale)
    );
    const values = validate(googleMerchantSchema, {
      googleMerchantId: (formData.get("google_merchant_id") as string)?.trim() || null,
      googleMerchantDatasourceId:
        (formData.get("google_merchant_datasource_id") as string)?.trim() || null,
      googleContentLanguage:
        (formData.get("google_content_language") as string)?.trim() || "en",
      enabledLocales: enabledLocalesRaw,
      googlePushLocales: googlePushLocalesRaw,
    });

    const { error } = await supabaseAdmin
      .from("stores")
      .update({
        google_merchant_id: values.googleMerchantId,
        google_merchant_datasource_id: values.googleMerchantDatasourceId,
        google_content_language: values.googleContentLanguage,
        enabled_locales: values.enabledLocales,
        google_push_locales: values.googlePushLocales,
      })
      .eq("id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/market/google-merchant-center");
    revalidatePath("/dashboard/market/delivery-markets");
    revalidatePath("/dashboard/market/xml-feed-urls");
    revalidatePath("/dashboard/products");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

/**
 * Live-checks every configured market/language product link from the
 * Delivery Markets page against one active product.
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

export async function updateDeliveryMarketSettings(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const googleFeedLabelsRaw = formData.getAll("google_feed_labels") as string[];
    const googleFeedLabelRaw = googleFeedLabelsRaw[0] || store.google_feed_label || "US";
    const productUrlPathRaw = (formData.get("product_url_path") as string)?.trim() || "products";

    const vatRatesRaw: Record<string, number> = {};
    for (const market of googleFeedLabelsRaw) {
      const raw = (formData.get(`vat_rate_${market}`) as string)?.trim();
      if (!raw) continue;
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
        vatRatesRaw[market] = parsed;
      }
    }

    const productUrlPathOverridesRaw: Record<string, string> = {};
    for (const locale of store.enabled_locales ?? []) {
      const raw = (formData.get(`product_url_path_override_${locale}`) as string)?.trim();
      if (raw) productUrlPathOverridesRaw[locale] = raw;
    }

    const values = validate(deliveryMarketsSchema, {
      googleFeedLabel: googleFeedLabelRaw,
      googleFeedLabels: googleFeedLabelsRaw.length > 0 ? googleFeedLabelsRaw : [googleFeedLabelRaw],
      productUrlPath: productUrlPathRaw,
      sourceLocaleHasPrefix: formData.get("source_locale_has_prefix") === "on",
      productUrlPathOverrides: productUrlPathOverridesRaw,
      vatRates: vatRatesRaw,
    });

    const { error } = await supabaseAdmin
      .from("stores")
      .update({
        google_feed_label: values.googleFeedLabel,
        google_feed_labels: values.googleFeedLabels,
        product_url_path: values.productUrlPath,
        source_locale_has_prefix: values.sourceLocaleHasPrefix,
        product_url_path_overrides: values.productUrlPathOverrides,
        vat_rates: values.vatRates,
      })
      .eq("id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/market/delivery-markets");
    revalidatePath("/dashboard/market/xml-feed-urls");
    revalidatePath("/dashboard/products");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
