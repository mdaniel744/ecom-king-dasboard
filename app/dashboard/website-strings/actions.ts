"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { syncTranslations } from "@/lib/translation-sync";
import type { Store, WebsiteString } from "@/lib/types";

const stringSchema = z.object({
  key: z.string().trim().min(1, "Key is required").max(200).regex(/^[a-zA-Z0-9._-]+$/, "Use only letters, numbers, dots, hyphens, underscores"),
  default_value: z.string().trim().min(1, "Value is required").max(2000),
});

function buildPayload(formData: FormData) {
  return validate(stringSchema, {
    key: (formData.get("key") as string)?.trim() ?? "",
    default_value: (formData.get("default_value") as string)?.trim() ?? "",
  });
}

async function syncStringTranslations(store: Store, str: WebsiteString) {
  await syncTranslations({
    store,
    entityType: "website_string",
    entityId: str.id,
    fields: { value: str.default_value },
  });
}

export async function createWebsiteString(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { data: str, error } = await supabaseAdmin
      .from("website_strings")
      .insert({ ...payload, store_id: store.id })
      .select()
      .single();

    if (error) throw error;

    await syncStringTranslations(store, str as WebsiteString);
    revalidatePath("/dashboard/website-strings");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateWebsiteString(stringId: string, formData: FormData): Promise<ActionResult> {
  try {
    stringId = validateId(stringId);
    const store = await getCurrentStore();
    const payload = buildPayload(formData);

    const { data: str, error } = await supabaseAdmin
      .from("website_strings")
      .update(payload)
      .eq("id", stringId)
      .eq("store_id", store.id)
      .select()
      .single();

    if (error) throw error;

    await syncStringTranslations(store, str as WebsiteString);
    revalidatePath("/dashboard/website-strings");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function deleteWebsiteString(stringId: string): Promise<ActionResult> {
  try {
    stringId = validateId(stringId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("website_strings")
      .delete()
      .eq("id", stringId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/website-strings");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
