"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { syncTranslations } from "@/lib/translation-sync";
import { slugify } from "@/lib/slug";
import type { Collection, Store } from "@/lib/types";

const collectionSchema = z.object({
  brand_id: z.string().uuid("Choose a brand"),
  name: z.string().trim().min(1, "Collection name is required").max(200),
  slug: z.string().min(1).max(200),
  description: z.string().trim().max(2000).nullable(),
  image_url: z.string().trim().max(2000).nullable(),
});

function buildPayload(formData: FormData) {
  const name = (formData.get("name") as string)?.trim() ?? "";
  const rawSlug = (formData.get("slug") as string)?.trim();

  return validate(collectionSchema, {
    brand_id: (formData.get("brand_id") as string) ?? "",
    name,
    slug: slugify(rawSlug || name),
    description: (formData.get("description") as string)?.trim() || null,
    image_url: (formData.get("image_url") as string)?.trim() || null,
  });
}

async function syncCollectionTranslations(store: Store, collection: Collection) {
  await syncTranslations({
    store,
    entityType: "collection",
    entityId: collection.id,
    fields: {
      name: collection.name,
      description: collection.description,
    },
  });
}

/** Confirms a brand_id actually belongs to this store, so a product from
 * one store can never be assigned another store's brand via a crafted request. */
async function assertBrandOwnedByStore(brandId: string, storeId: string) {
  const { data } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (!data) throw new Error("That brand doesn't belong to this store.");
}

export async function createCollection(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const payload = buildPayload(formData);
    await assertBrandOwnedByStore(payload.brand_id, store.id);

    const { data: collection, error } = await supabaseAdmin
      .from("collections")
      .insert({ ...payload, store_id: store.id })
      .select()
      .single();

    if (error) throw error;

    await syncCollectionTranslations(store, collection as Collection);
    revalidatePath("/dashboard/collections");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateCollection(collectionId: string, formData: FormData): Promise<ActionResult> {
  try {
    collectionId = validateId(collectionId);
    const store = await getCurrentStore();
    const payload = buildPayload(formData);
    await assertBrandOwnedByStore(payload.brand_id, store.id);

    const { data: collection, error } = await supabaseAdmin
      .from("collections")
      .update(payload)
      .eq("id", collectionId)
      .eq("store_id", store.id)
      .select()
      .single();

    if (error) throw error;

    await syncCollectionTranslations(store, collection as Collection);
    revalidatePath("/dashboard/collections");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function deleteCollection(collectionId: string): Promise<ActionResult> {
  try {
    collectionId = validateId(collectionId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("collections")
      .delete()
      .eq("id", collectionId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/collections");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
