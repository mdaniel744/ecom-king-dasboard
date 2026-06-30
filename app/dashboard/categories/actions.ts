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

const categoryFieldsSchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(200, "Name is too long"),
  parentId: z.string().uuid().nullable(),
  imageUrl: z.string().trim().max(2000, "Image URL is too long").nullable(),
  description: z.string().trim().max(5000, "Description is too long").nullable(),
  isFeatured: z.boolean(),
  displayOrder: z.number("Display order must be a number").int().min(0, "Display order can't be negative").max(100000),
  metaTitle: z.string().trim().max(300, "SEO title is too long").nullable(),
  metaDescription: z.string().trim().max(500, "SEO description is too long").nullable(),
});

function readCategoryFields(formData: FormData) {
  const name = (formData.get("name") as string)?.trim() ?? "";
  const parentId = (formData.get("parent_id") as string) || null;
  const imageUrl = (formData.get("image_url") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const isFeatured = formData.get("is_featured") === "on";
  const displayOrder = Number(formData.get("display_order") ?? 0) || 0;
  const metaTitle = (formData.get("meta_title") as string)?.trim() || null;
  const metaDescription = (formData.get("meta_description") as string)?.trim() || null;

  return validate(categoryFieldsSchema, {
    name,
    parentId,
    imageUrl,
    description,
    isFeatured,
    displayOrder,
    metaTitle,
    metaDescription,
  });
}

export async function createCategory(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const fields = readCategoryFields(formData);

    const { data: category, error } = await supabaseAdmin
      .from("categories")
      .insert({
        store_id: store.id,
        name: fields.name,
        slug: slugify(fields.name),
        parent_id: fields.parentId,
        image_url: fields.imageUrl,
        description: fields.description,
        is_featured: fields.isFeatured,
        display_order: fields.displayOrder,
        meta_title: fields.metaTitle,
        meta_description: fields.metaDescription,
      })
      .select()
      .single();

    if (error) throw error;

    await syncCategoryTranslations(store, category.id, fields);
    revalidatePath("/dashboard/categories");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateCategory(categoryId: string, formData: FormData): Promise<ActionResult> {
  try {
    categoryId = validateId(categoryId);
    const store = await getCurrentStore();
    const fields = readCategoryFields(formData);

    const { error } = await supabaseAdmin
      .from("categories")
      .update({
        name: fields.name,
        parent_id: fields.parentId,
        image_url: fields.imageUrl,
        description: fields.description,
        is_featured: fields.isFeatured,
        display_order: fields.displayOrder,
        meta_title: fields.metaTitle,
        meta_description: fields.metaDescription,
      })
      .eq("id", categoryId)
      .eq("store_id", store.id);

    if (error) throw error;

    await syncCategoryTranslations(store, categoryId, fields);
    revalidatePath("/dashboard/categories");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

async function syncCategoryTranslations(
  store: Store,
  categoryId: string,
  fields: { name: string; description: string | null; metaTitle: string | null; metaDescription: string | null }
) {
  await syncTranslations({
    store,
    entityType: "category",
    entityId: categoryId,
    fields: {
      name: fields.name,
      description: fields.description,
      meta_title: fields.metaTitle,
      meta_description: fields.metaDescription,
    },
  });
}

export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  try {
    categoryId = validateId(categoryId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("categories")
      .delete()
      .eq("id", categoryId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/categories");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
