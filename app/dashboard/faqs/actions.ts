"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { syncTranslations } from "@/lib/translation-sync";
import type { Faq, Store } from "@/lib/types";

const faqSchema = z.object({
  question: z.string().trim().min(1, "Question is required").max(500),
  answer: z.string().trim().min(1, "Answer is required").max(5000),
  category: z.string().trim().max(100).nullable(),
});

function buildPayload(formData: FormData) {
  return validate(faqSchema, {
    question: (formData.get("question") as string)?.trim() ?? "",
    answer: (formData.get("answer") as string)?.trim() ?? "",
    category: (formData.get("category") as string)?.trim() || null,
  });
}

async function syncFaqTranslations(store: Store, faq: Faq) {
  await syncTranslations({
    store,
    entityType: "faq",
    entityId: faq.id,
    fields: {
      question: faq.question,
      answer: faq.answer,
    },
  });
}

export async function createFaq(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { data: faq, error } = await supabaseAdmin
      .from("faqs")
      .insert({ ...payload, store_id: store.id })
      .select()
      .single();

    if (error) throw error;

    await syncFaqTranslations(store, faq as Faq);
    revalidatePath("/dashboard/faqs");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateFaq(faqId: string, formData: FormData): Promise<ActionResult> {
  try {
    faqId = validateId(faqId);
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { data: faq, error } = await supabaseAdmin
      .from("faqs")
      .update(payload)
      .eq("id", faqId)
      .eq("store_id", store.id)
      .select()
      .single();

    if (error) throw error;

    await syncFaqTranslations(store, faq as Faq);
    revalidatePath("/dashboard/faqs");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function deleteFaq(faqId: string): Promise<ActionResult> {
  try {
    faqId = validateId(faqId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("faqs")
      .delete()
      .eq("id", faqId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/faqs");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
