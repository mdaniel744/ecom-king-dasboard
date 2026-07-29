"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { syncTranslations } from "@/lib/translation-sync";
import { slugify } from "@/lib/slug";
import type { Guide, Store } from "@/lib/types";

const guideSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  slug: z.string().min(1).max(300),
  category: z.string().trim().max(100).nullable(),
  excerpt: z.string().trim().max(1000).nullable(),
  content: z.string().trim().max(50000).nullable(),
  published: z.boolean(),
});

function buildPayload(formData: FormData) {
  const title = (formData.get("title") as string)?.trim() ?? "";
  const rawSlug = (formData.get("slug") as string)?.trim();

  return validate(guideSchema, {
    title,
    slug: slugify(rawSlug || title),
    category: (formData.get("category") as string)?.trim() || null,
    excerpt: (formData.get("excerpt") as string)?.trim() || null,
    content: (formData.get("content") as string)?.trim() || null,
    published: formData.get("published") === "on",
  });
}

async function syncGuideTranslations(store: Store, guide: Guide) {
  await syncTranslations({
    store,
    entityType: "guide",
    entityId: guide.id,
    fields: {
      title: guide.title,
      excerpt: guide.excerpt,
      content: guide.content,
    },
  });
}

export async function createGuide(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { data: guide, error } = await supabaseAdmin
      .from("guides")
      .insert({ ...payload, store_id: store.id })
      .select()
      .single();

    if (error) throw error;

    await syncGuideTranslations(store, guide as Guide);
    revalidatePath("/dashboard/guides");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateGuide(guideId: string, formData: FormData): Promise<ActionResult> {
  try {
    guideId = validateId(guideId);
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { data: guide, error } = await supabaseAdmin
      .from("guides")
      .update(payload)
      .eq("id", guideId)
      .eq("store_id", store.id)
      .select()
      .single();

    if (error) throw error;

    await syncGuideTranslations(store, guide as Guide);
    revalidatePath("/dashboard/guides");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function deleteGuide(guideId: string): Promise<ActionResult> {
  try {
    guideId = validateId(guideId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("guides")
      .delete()
      .eq("id", guideId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/guides");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
