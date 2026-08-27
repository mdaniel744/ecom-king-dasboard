"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slug";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { syncTranslations } from "@/lib/translation-sync";
import type { Store } from "@/lib/types";

const familyFieldsSchema = z.object({
  name: z.string().trim().min(1, "Family name is required").max(200, "Name is too long"),
  categoryId: z.string().uuid().nullable(),
  description: z.string().trim().max(5000, "Description is too long").nullable(),
  shortDescription: z.string().trim().max(500, "Short description is too long").nullable(),
  imageUrl: z.string().trim().max(2000, "Image URL is too long").nullable(),
  isFeatured: z.boolean(),
});

function readFamilyFields(formData: FormData) {
  const name = (formData.get("name") as string)?.trim() ?? "";
  const categoryId = (formData.get("category_id") as string) || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const shortDescription = (formData.get("short_description") as string)?.trim() || null;
  const imageUrl = (formData.get("image_url") as string)?.trim() || null;
  const isFeatured = formData.get("is_featured") === "on";

  return validate(familyFieldsSchema, {
    name,
    categoryId,
    description,
    shortDescription,
    imageUrl,
    isFeatured,
  });
}

export async function createProductFamily(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const fields = readFamilyFields(formData);

    const { data: family, error } = await supabaseAdmin
      .from("product_families")
      .insert({
        store_id: store.id,
        category_id: fields.categoryId,
        name: fields.name,
        slug: slugify(fields.name),
        description: fields.description,
        short_description: fields.shortDescription,
        images: fields.imageUrl ? [fields.imageUrl] : [],
        is_featured: fields.isFeatured,
      })
      .select()
      .single();

    if (error) throw error;

    await syncFamilyTranslations(store, family.id, fields);
    revalidatePath("/dashboard/product-families");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateProductFamily(familyId: string, formData: FormData): Promise<ActionResult> {
  try {
    familyId = validateId(familyId);
    const store = await getCurrentStore();
    const fields = readFamilyFields(formData);

    const { error } = await supabaseAdmin
      .from("product_families")
      .update({
        category_id: fields.categoryId,
        name: fields.name,
        description: fields.description,
        short_description: fields.shortDescription,
        images: fields.imageUrl ? [fields.imageUrl] : [],
        is_featured: fields.isFeatured,
      })
      .eq("id", familyId)
      .eq("store_id", store.id);

    if (error) throw error;

    await syncFamilyTranslations(store, familyId, fields);
    revalidatePath("/dashboard/product-families");
    revalidatePath("/dashboard/products");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

async function syncFamilyTranslations(
  store: Store,
  familyId: string,
  fields: { name: string; description: string | null; shortDescription: string | null }
) {
  await syncTranslations({
    store,
    entityType: "product_family",
    entityId: familyId,
    fields: {
      name: fields.name,
      description: fields.description,
      short_description: fields.shortDescription,
    },
  });
}

/**
 * Deleting a family never deletes or breaks the products in it -- the FK is
 * ON DELETE SET NULL, so every member product just goes back to standalone
 * (family_id null), exactly like a product that was never grouped at all.
 */
export async function deleteProductFamily(familyId: string): Promise<ActionResult> {
  try {
    familyId = validateId(familyId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("product_families")
      .delete()
      .eq("id", familyId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/product-families");
    revalidatePath("/dashboard/products");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
