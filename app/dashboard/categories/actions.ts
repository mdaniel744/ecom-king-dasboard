"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slug";

function readCategoryFields(formData: FormData) {
  const name = (formData.get("name") as string).trim();
  const parentId = (formData.get("parent_id") as string) || null;
  const imageUrl = (formData.get("image_url") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const isFeatured = formData.get("is_featured") === "on";
  const displayOrder = Number(formData.get("display_order") ?? 0) || 0;
  const metaTitle = (formData.get("meta_title") as string)?.trim() || null;
  const metaDescription = (formData.get("meta_description") as string)?.trim() || null;

  return {
    name,
    parentId,
    imageUrl,
    description,
    isFeatured,
    displayOrder,
    metaTitle,
    metaDescription,
  };
}

export async function createCategory(formData: FormData) {
  const store = await getCurrentStore();
  const fields = readCategoryFields(formData);

  const { error } = await supabaseAdmin.from("categories").insert({
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
  });

  if (error) throw new Error(`Failed to create category: ${error.message}`);

  revalidatePath("/dashboard/categories");
}

export async function updateCategory(categoryId: string, formData: FormData) {
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

  if (error) throw new Error(`Failed to update category: ${error.message}`);

  revalidatePath("/dashboard/categories");
}

export async function deleteCategory(categoryId: string) {
  const store = await getCurrentStore();

  const { error } = await supabaseAdmin
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("store_id", store.id);

  if (error) throw new Error(`Failed to delete category: ${error.message}`);

  revalidatePath("/dashboard/categories");
}
