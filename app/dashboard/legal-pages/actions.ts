"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { syncTranslations } from "@/lib/translation-sync";
import { slugify } from "@/lib/slug";
import type { LegalPage, Store } from "@/lib/types";

const legalPageSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  slug: z.string().min(1).max(300),
  content: z.string().trim().max(50000).nullable(),
  meta_title: z.string().trim().max(200).nullable(),
  meta_description: z.string().trim().max(500).nullable(),
});

function buildPayload(formData: FormData) {
  const title = (formData.get("title") as string)?.trim() ?? "";
  const rawSlug = (formData.get("slug") as string)?.trim();

  return validate(legalPageSchema, {
    title,
    slug: slugify(rawSlug || title),
    content: (formData.get("content") as string)?.trim() || null,
    meta_title: (formData.get("meta_title") as string)?.trim() || null,
    meta_description: (formData.get("meta_description") as string)?.trim() || null,
  });
}

async function syncLegalPageTranslations(store: Store, page: LegalPage) {
  await syncTranslations({
    store,
    entityType: "legal_page",
    entityId: page.id,
    fields: {
      title: page.title,
      content: page.content,
      meta_title: page.meta_title,
      meta_description: page.meta_description,
    },
  });
}

export async function createLegalPage(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { data: page, error } = await supabaseAdmin
      .from("legal_pages")
      .insert({ ...payload, store_id: store.id })
      .select()
      .single();

    if (error) throw error;

    await syncLegalPageTranslations(store, page as LegalPage);
    revalidatePath("/dashboard/legal-pages");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateLegalPage(pageId: string, formData: FormData): Promise<ActionResult> {
  try {
    pageId = validateId(pageId);
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { data: page, error } = await supabaseAdmin
      .from("legal_pages")
      .update(payload)
      .eq("id", pageId)
      .eq("store_id", store.id)
      .select()
      .single();

    if (error) throw error;

    await syncLegalPageTranslations(store, page as LegalPage);
    revalidatePath("/dashboard/legal-pages");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function deleteLegalPage(pageId: string): Promise<ActionResult> {
  try {
    pageId = validateId(pageId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("legal_pages")
      .delete()
      .eq("id", pageId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/legal-pages");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
