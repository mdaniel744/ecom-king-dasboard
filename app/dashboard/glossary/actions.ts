"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";

const glossarySchema = z.object({
  original_term: z.string().trim().min(1, "Original term is required").max(200),
  rule_type: z.enum(["preserve", "always_translate", "never_translate"]),
  translations: z.record(z.string(), z.string()),
  notes: z.string().trim().max(1000).nullable(),
  active: z.boolean(),
});

function parseTranslations(formData: FormData): Record<string, string> {
  const locales = formData.getAll("translation_locale") as string[];
  const values = formData.getAll("translation_value") as string[];
  const translations: Record<string, string> = {};
  locales.forEach((locale, i) => {
    const value = (values[i] ?? "").trim();
    if (locale && value) translations[locale] = value;
  });
  return translations;
}

function buildPayload(formData: FormData) {
  return validate(glossarySchema, {
    original_term: (formData.get("original_term") as string)?.trim() ?? "",
    rule_type: (formData.get("rule_type") as string) || "always_translate",
    translations: parseTranslations(formData),
    notes: (formData.get("notes") as string)?.trim() || null,
    active: formData.get("active") === "on",
  });
}

export async function createGlossaryTerm(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { error } = await supabaseAdmin.from("glossary").insert({ ...payload, store_id: store.id });
    if (error) throw error;

    revalidatePath("/dashboard/glossary");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateGlossaryTerm(termId: string, formData: FormData): Promise<ActionResult> {
  try {
    termId = validateId(termId);
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { error } = await supabaseAdmin
      .from("glossary")
      .update(payload)
      .eq("id", termId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/glossary");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function deleteGlossaryTerm(termId: string): Promise<ActionResult> {
  try {
    termId = validateId(termId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("glossary")
      .delete()
      .eq("id", termId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/glossary");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
