"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slug";
import {
  upsertGoogleProduct,
  GoogleMerchantConfigError,
  GoogleMerchantValidationError,
} from "@/lib/google-merchant";
import { checkProductForMerchant, hasBlockingIssues } from "@/lib/merchant-rules";
import { validate, validateId } from "@/lib/validation";
import { syncTranslations } from "@/lib/translation-sync";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import type { Product, ProductCondition, ProductStatus, Store } from "@/lib/types";

const productPayloadSchema = z.object({
  name: z.string().trim().min(1, "Title is required").max(500, "Title is too long"),
  slug: z.string().min(1).max(500),
  short_description: z.string().trim().max(500, "Short description is too long (max 500 characters)").nullable(),
  description: z.string().trim().max(10000, "Description is too long").nullable(),
  price: z.number("Price must be a number").finite().min(0, "Price can't be negative").nullable(),
  sale_price: z.number("Sale price must be a number").finite().min(0, "Sale price can't be negative").nullable(),
  currency: z.string().trim().length(3, "Currency must be a 3-letter code, e.g. USD"),
  sku: z.string().trim().max(200, "SKU is too long").nullable(),
  stock_quantity: z.number("Stock quantity must be a number").int("Stock quantity must be a whole number").min(0, "Stock quantity can't be negative"),
  status: z.enum(["draft", "active", "archived"]),
  condition: z.enum(["new", "used", "refurbished"]),
  brand: z.string().trim().max(200, "Brand is too long").nullable(),
  mpn: z.string().trim().max(200, "MPN is too long").nullable(),
  google_product_category: z.string().trim().max(500, "Google product category is too long").nullable(),
  is_featured: z.boolean(),
  badge: z.string().trim().max(100, "Badge text is too long (max 100 characters)").nullable(),
  category_id: z.string().uuid("Choose a valid category").nullable(),
  images: z.array(z.string().trim().min(1).max(2000)).max(20, "Maximum 20 images"),
  image_alts: z.array(z.string().trim().max(500)).max(20),
  attributes: z.record(z.string(), z.string()),
});

function parseAttributes(formData: FormData): Record<string, string> {
  const keys = formData.getAll("attr_key") as string[];
  const values = formData.getAll("attr_value") as string[];
  const attributes: Record<string, string> = {};
  keys.forEach((key, i) => {
    const trimmedKey = key.trim();
    const value = (values[i] ?? "").trim();
    if (trimmedKey && value) attributes[trimmedKey] = value;
  });
  return attributes;
}

function parseImages(formData: FormData): string[] {
  return (formData.getAll("images") as string[])
    .map((url) => url.trim())
    .filter(Boolean);
}

function parseImageAlts(formData: FormData): string[] {
  return (formData.getAll("image_alts") as string[]).map((s) => s.trim());
}

function buildProductPayload(formData: FormData) {
  const name = (formData.get("name") as string)?.trim() ?? "";
  const rawSlug = (formData.get("slug") as string)?.trim();
  const priceRaw = formData.get("price") as string;
  const salePriceRaw = formData.get("sale_price") as string;
  const categoryId = formData.get("category_id") as string;

  return validate(productPayloadSchema, {
    name,
    slug: slugify(rawSlug || name),
    short_description: (formData.get("short_description") as string) || null,
    description: (formData.get("description") as string) || null,
    price: priceRaw ? Number(priceRaw) : null,
    sale_price: salePriceRaw ? Number(salePriceRaw) : null,
    currency: (formData.get("currency") as string) || "USD",
    sku: (formData.get("sku") as string) || null,
    stock_quantity: Number(formData.get("stock_quantity") || 0),
    status: (formData.get("status") as ProductStatus) || "draft",
    condition: (formData.get("condition") as ProductCondition) || "new",
    brand: (formData.get("brand") as string) || null,
    mpn: (formData.get("mpn") as string) || null,
    google_product_category: (formData.get("google_product_category") as string) || null,
    is_featured: formData.get("is_featured") === "on",
    badge: (formData.get("badge") as string)?.trim() || null,
    category_id: categoryId || null,
    images: parseImages(formData),
    image_alts: parseImageAlts(formData),
    attributes: parseAttributes(formData),
  });
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const payload = buildProductPayload(formData);

    const { data: product, error } = await supabaseAdmin
      .from("products")
      .insert({ ...payload, store_id: store.id })
      .select()
      .single();

    if (error) throw error;

    await syncProductTranslations(store, product as Product);
    revalidatePath("/dashboard/products");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateProduct(productId: string, formData: FormData): Promise<ActionResult> {
  try {
    productId = validateId(productId);
    const store = await getCurrentStore();
    const payload = buildProductPayload(formData);

    const { data: product, error } = await supabaseAdmin
      .from("products")
      .update(payload)
      .eq("id", productId)
      .eq("store_id", store.id)
      .select()
      .single();

    if (error) throw error;

    await syncProductTranslations(store, product as Product);
    revalidatePath("/dashboard/products");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

async function syncProductTranslations(store: Store, product: Product) {
  const categoryPath = await buildCategoryBreadcrumb(product.category_id);
  await syncTranslations({
    store,
    entityType: "product",
    entityId: product.id,
    categoryPath,
    fields: {
      name: product.name,
      short_description: product.short_description,
      description: product.description,
      badge: product.badge,
    },
  });
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  try {
    productId = validateId(productId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("products")
      .delete()
      .eq("id", productId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/products");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

/**
 * Builds a "Parent > Child" breadcrumb string from a category's lineage,
 * for Google's free-text productType field (distinct from the official
 * Google taxonomy, which we don't map to and leave unset, same as the
 * legacy feed this replaces).
 */
async function buildCategoryBreadcrumb(categoryId: string | null): Promise<string | null> {
  if (!categoryId) return null;

  const { data: category } = await supabaseAdmin
    .from("categories")
    .select("name, parent_id")
    .eq("id", categoryId)
    .maybeSingle();

  if (!category) return null;
  if (!category.parent_id) return category.name;

  const { data: parent } = await supabaseAdmin
    .from("categories")
    .select("name")
    .eq("id", category.parent_id)
    .maybeSingle();

  return parent ? `${parent.name} > ${category.name}` : category.name;
}

type SyncOutcome = { success: boolean; error?: string };

/**
 * Syncs one already-fetched product to Google and persists the resulting
 * status/error. Shared by the single-product and bulk-sync entry points so
 * both write identical, correct status — don't duplicate this logic inline.
 */
async function syncSingleProduct(
  store: Store,
  product: Product
): Promise<SyncOutcome> {
  const productType = await buildCategoryBreadcrumb(product.category_id);

  try {
    const result = await upsertGoogleProduct(store, product, productType);

    await supabaseAdmin
      .from("products")
      .update({
        google_sync_status: "synced",
        google_product_id: result.name,
        google_sync_error: null,
      })
      .eq("id", product.id)
      .eq("store_id", store.id);

    return { success: true };
  } catch (err) {
    const message =
      err instanceof GoogleMerchantConfigError || err instanceof GoogleMerchantValidationError
        ? err.message
        : `Google Merchant sync failed: ${err instanceof Error ? err.message : String(err)}`;

    await supabaseAdmin
      .from("products")
      .update({ google_sync_status: "error", google_sync_error: message })
      .eq("id", product.id)
      .eq("store_id", store.id);

    return { success: false, error: message };
  }
}

export async function syncProductToGoogle(productId: string): Promise<SyncOutcome> {
  productId = validateId(productId);
  const store = await getCurrentStore();

  const { data: product, error: fetchError } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("store_id", store.id)
    .single();

  if (fetchError || !product) {
    return { success: false, error: "Product not found." };
  }

  const outcome = await syncSingleProduct(store, product as Product);
  revalidatePath("/dashboard/products");
  return outcome;
}

export type BulkSyncResult = {
  productId: string;
  name: string;
  status: "synced" | "skipped" | "failed";
  error?: string;
};

// The Google service account credential is shared across every tenant on
// the platform (see CLAUDE.md) — these bound how much of that shared quota
// a single store's bulk sync click can consume in one run.
const MAX_BULK_SYNC = 200;
const BULK_SYNC_DELAY_MS = 150;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Syncs every product in the store, skipping (without calling Google) any
 * product the deterministic rules engine already knows will be rejected —
 * this avoids burning API calls on known-bad data and gives the user a
 * precise reason for every product that didn't end up synced. Capped and
 * throttled (see constants above) since this hits a service account shared
 * by every tenant, not just this store.
 */
export async function syncAllProductsToGoogle(): Promise<BulkSyncResult[]> {
  const store = await getCurrentStore();

  const { data: allProducts, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("store_id", store.id)
    .limit(MAX_BULK_SYNC);

  if (error || !allProducts) return [];

  const products = allProducts as Product[];
  const results: BulkSyncResult[] = [];

  for (const raw of products) {
    const issues = checkProductForMerchant(raw, store);
    if (hasBlockingIssues(issues)) {
      const reason = issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message)
        .join(" ");

      await supabaseAdmin
        .from("products")
        .update({ google_sync_status: "error", google_sync_error: reason })
        .eq("id", raw.id)
        .eq("store_id", store.id);

      results.push({ productId: raw.id, name: raw.name, status: "skipped", error: reason });
      continue;
    }

    const outcome = await syncSingleProduct(store, raw);
    await sleep(BULK_SYNC_DELAY_MS);
    results.push({
      productId: raw.id,
      name: raw.name,
      status: outcome.success ? "synced" : "failed",
      error: outcome.error,
    });
  }

  revalidatePath("/dashboard/products");
  return results;
}
