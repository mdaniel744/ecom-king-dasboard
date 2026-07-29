"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { syncTranslations } from "@/lib/translation-sync";
import { slugify } from "@/lib/slug";
import type { Brand, Store } from "@/lib/types";

const brandSchema = z.object({
  name: z.string().trim().min(1, "Brand name is required").max(200),
  slug: z.string().min(1).max(200),
  short_description: z.string().trim().max(500).nullable(),
  long_description: z.string().trim().max(10000).nullable(),
  disclaimer: z.string().trim().max(2000).nullable(),
  meta_title: z.string().trim().max(200).nullable(),
  meta_description: z.string().trim().max(500).nullable(),
  logo_light_url: z.string().trim().max(2000).nullable(),
  logo_dark_url: z.string().trim().max(2000).nullable(),
  hero_image_url: z.string().trim().max(2000).nullable(),
});

function buildPayload(formData: FormData) {
  const name = (formData.get("name") as string)?.trim() ?? "";
  const rawSlug = (formData.get("slug") as string)?.trim();

  return validate(brandSchema, {
    name,
    slug: slugify(rawSlug || name),
    short_description: (formData.get("short_description") as string)?.trim() || null,
    long_description: (formData.get("long_description") as string)?.trim() || null,
    disclaimer: (formData.get("disclaimer") as string)?.trim() || null,
    meta_title: (formData.get("meta_title") as string)?.trim() || null,
    meta_description: (formData.get("meta_description") as string)?.trim() || null,
    logo_light_url: (formData.get("logo_light_url") as string)?.trim() || null,
    logo_dark_url: (formData.get("logo_dark_url") as string)?.trim() || null,
    hero_image_url: (formData.get("hero_image_url") as string)?.trim() || null,
  });
}

async function syncBrandTranslations(store: Store, brand: Brand) {
  await syncTranslations({
    store,
    entityType: "brand",
    entityId: brand.id,
    fields: {
      name: brand.name,
      short_description: brand.short_description,
      long_description: brand.long_description,
      disclaimer: brand.disclaimer,
      meta_title: brand.meta_title,
      meta_description: brand.meta_description,
    },
  });
}

export async function createBrand(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { data: brand, error } = await supabaseAdmin
      .from("brands")
      .insert({ ...payload, store_id: store.id })
      .select()
      .single();

    if (error) throw error;

    await syncBrandTranslations(store, brand as Brand);
    revalidatePath("/dashboard/brands");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateBrand(brandId: string, formData: FormData): Promise<ActionResult> {
  try {
    brandId = validateId(brandId);
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { data: brand, error } = await supabaseAdmin
      .from("brands")
      .update(payload)
      .eq("id", brandId)
      .eq("store_id", store.id)
      .select()
      .single();

    if (error) throw error;

    await syncBrandTranslations(store, brand as Brand);
    revalidatePath("/dashboard/brands");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function deleteBrand(brandId: string): Promise<ActionResult> {
  try {
    brandId = validateId(brandId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("brands")
      .delete()
      .eq("id", brandId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/brands");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
