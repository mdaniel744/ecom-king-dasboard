"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slug";
import {
  upsertGoogleProduct,
  GoogleMerchantConfigError,
  GoogleMerchantValidationError,
} from "@/lib/google-merchant";
import { checkProductForMerchant, hasBlockingIssues } from "@/lib/merchant-rules";
import type { Product, ProductCondition, ProductStatus, Store } from "@/lib/types";

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

function buildProductPayload(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const rawSlug = (formData.get("slug") as string)?.trim();
  const priceRaw = formData.get("price") as string;
  const salePriceRaw = formData.get("sale_price") as string;
  const categoryId = formData.get("category_id") as string;

  return {
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
    is_featured: formData.get("is_featured") === "on",
    badge: (formData.get("badge") as string)?.trim() || null,
    category_id: categoryId || null,
    images: parseImages(formData),
    attributes: parseAttributes(formData),
  };
}

export async function createProduct(formData: FormData) {
  const store = await getCurrentStore();
  const payload = buildProductPayload(formData);

  const { error } = await supabaseAdmin
    .from("products")
    .insert({ ...payload, store_id: store.id });

  if (error) throw new Error(`Failed to create product: ${error.message}`);

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}

export async function updateProduct(productId: string, formData: FormData) {
  const store = await getCurrentStore();
  const payload = buildProductPayload(formData);

  const { error } = await supabaseAdmin
    .from("products")
    .update(payload)
    .eq("id", productId)
    .eq("store_id", store.id);

  if (error) throw new Error(`Failed to update product: ${error.message}`);

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}

export async function deleteProduct(productId: string) {
  const store = await getCurrentStore();

  const { error } = await supabaseAdmin
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("store_id", store.id);

  if (error) throw new Error(`Failed to delete product: ${error.message}`);

  revalidatePath("/dashboard/products");
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
        : "Failed to sync with Google Merchant. Check the product data and try again.";

    await supabaseAdmin
      .from("products")
      .update({ google_sync_status: "error", google_sync_error: message })
      .eq("id", product.id)
      .eq("store_id", store.id);

    return { success: false, error: message };
  }
}

export async function syncProductToGoogle(productId: string): Promise<SyncOutcome> {
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

/**
 * Syncs every product in the store, skipping (without calling Google) any
 * product the deterministic rules engine already knows will be rejected —
 * this avoids burning API calls on known-bad data and gives the user a
 * precise reason for every product that didn't end up synced.
 */
export async function syncAllProductsToGoogle(): Promise<BulkSyncResult[]> {
  const store = await getCurrentStore();

  const { data: products, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("store_id", store.id);

  if (error || !products) return [];

  const results: BulkSyncResult[] = [];

  for (const raw of products as Product[]) {
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
