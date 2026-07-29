"use server";

import { z } from "zod";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";

const entityTypeSchema = z.enum(["product", "category", "attribute_name", "attribute_value", "brand", "collection", "guide", "faq"]);

/**
 * Every translation row (any locale) for one entity, keyed by locale then
 * field name — e.g. { de: { name: "...", description: "..." }, fr: {...} }.
 * Used to populate the inline language switcher in edit forms.
 */
export async function getEntityTranslations(
  entityType: z.infer<typeof entityTypeSchema>,
  entityId: string
): Promise<Record<string, Record<string, { value: string; translator: "ai" | "human" }>>> {
  entityId = validateId(entityId);
  const store = await getCurrentStore();

  const { data } = await supabaseAdmin
    .from("translations")
    .select("locale, field_name, value, translator")
    .eq("store_id", store.id)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  const result: Record<string, Record<string, { value: string; translator: "ai" | "human" }>> = {};
  for (const row of data ?? []) {
    if (!result[row.locale]) result[row.locale] = {};
    result[row.locale][row.field_name] = { value: row.value, translator: row.translator };
  }
  return result;
}

const saveSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().uuid(),
  fieldName: z.string().trim().min(1).max(100),
  locale: z.string().trim().min(2).max(10),
  value: z.string().trim().min(1, "Translation can't be empty — use Reset to remove it instead").max(10000),
});

/**
 * Saves a human-written correction for one field/locale. Marked
 * translator: "human" so future AI translation runs (see
 * lib/translation-sync.ts) skip it permanently instead of overwriting it.
 */
export async function saveManualTranslation(input: z.infer<typeof saveSchema>): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const { entityType, entityId, fieldName, locale, value } = validate(saveSchema, input);

    const { error } = await supabaseAdmin.from("translations").upsert(
      {
        store_id: store.id,
        entity_type: entityType,
        entity_id: entityId,
        field_name: fieldName,
        locale,
        value,
        translator: "human",
      },
      { onConflict: "entity_type,entity_id,field_name,locale" }
    );

    if (error) throw error;
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

const resetSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().uuid(),
  fieldName: z.string().trim().min(1).max(100),
  locale: z.string().trim().min(2).max(10),
});

/**
 * Deletes a translation row entirely, handing control back to AI — the
 * storefront falls back to the source-language value until the next save
 * of the parent entity triggers a fresh AI translation for this slot.
 */
export async function resetTranslationToAI(input: z.infer<typeof resetSchema>): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const { entityType, entityId, fieldName, locale } = validate(resetSchema, input);

    const { error } = await supabaseAdmin
      .from("translations")
      .delete()
      .eq("store_id", store.id)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("field_name", fieldName)
      .eq("locale", locale);

    if (error) throw error;
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
