"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { syncAttributeTranslations, syncTranslations } from "@/lib/translation-sync";

const attributeSchema = z.object({
  name: z.string().trim().min(1, "Attribute name is required").max(200, "Name is too long"),
  values: z.array(z.string().trim().min(1).max(200, "Each value must be under 200 characters")).max(200, "Maximum 200 values per attribute"),
});

const attributeValueSchema = z.object({
  value: z.string().trim().min(1, "Value is required").max(200, "Value is too long"),
  label: z.string().trim().max(300, "Label is too long").nullable(),
  image_url: z.string().trim().max(2000, "Image URL is too long").nullable(),
  description: z.string().trim().max(1000, "Description is too long").nullable(),
});

export async function createAttribute(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const nameRaw = (formData.get("name") as string)?.trim() ?? "";
    const valuesRaw = (formData.get("values") as string) || "";
    const valuesArr = valuesRaw.split(",").map((v) => v.trim()).filter(Boolean);

    const { name, values } = validate(attributeSchema, { name: nameRaw, values: valuesArr });

    const { data: attribute, error } = await supabaseAdmin
      .from("attributes")
      .insert({ store_id: store.id, name })
      .select()
      .single();

    if (error) throw error;

    let savedValues: { id: string; value: string }[] = [];
    if (values.length) {
      const { data: inserted, error: valuesError } = await supabaseAdmin
        .from("attribute_values")
        .insert(values.map((value) => ({ attribute_id: attribute.id, value })))
        .select("id, value");

      if (valuesError) throw valuesError;
      savedValues = inserted ?? [];
    }

    await syncAttributeTranslations(store, attribute.id, name, savedValues);

    revalidatePath("/dashboard/attributes");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateAttribute(attributeId: string, formData: FormData): Promise<ActionResult> {
  try {
    attributeId = validateId(attributeId);
    const store = await getCurrentStore();
    const nameRaw = (formData.get("name") as string)?.trim() ?? "";
    const valuesRaw = (formData.get("values") as string) || "";
    const valuesArr = valuesRaw.split(",").map((v) => v.trim()).filter(Boolean);

    const { name, values } = validate(attributeSchema, { name: nameRaw, values: valuesArr });

    const { data: attribute, error } = await supabaseAdmin
      .from("attributes")
      .update({ name })
      .eq("id", attributeId)
      .eq("store_id", store.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!attribute) throw new Error("Attribute not found or not yours.");

    // Append only genuinely new values — re-submitting an existing one is a no-op,
    // not a duplicate badge.
    const { data: existing } = await supabaseAdmin
      .from("attribute_values")
      .select("value")
      .eq("attribute_id", attributeId);
    const existingSet = new Set((existing ?? []).map((v) => v.value.toLowerCase()));
    const newValues = values.filter((v) => !existingSet.has(v.toLowerCase()));

    let savedValues: { id: string; value: string }[] = [];
    if (newValues.length) {
      const { data: inserted, error: valuesError } = await supabaseAdmin
        .from("attribute_values")
        .insert(newValues.map((value) => ({ attribute_id: attributeId, value })))
        .select("id, value");

      if (valuesError) throw valuesError;
      savedValues = inserted ?? [];
    }

    await syncAttributeTranslations(store, attributeId, name, savedValues);

    revalidatePath("/dashboard/attributes");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function deleteAttributeValue(valueId: string): Promise<ActionResult> {
  try {
    valueId = validateId(valueId);
    const store = await getCurrentStore();

    // Verify the value's parent attribute belongs to this store
    const { data: av, error: fetchErr } = await supabaseAdmin
      .from("attribute_values")
      .select("id, attribute_id")
      .eq("id", valueId)
      .single();
    if (fetchErr || !av) throw new Error("Value not found.");

    const { data: attr, error: attrErr } = await supabaseAdmin
      .from("attributes")
      .select("id")
      .eq("id", av.attribute_id)
      .eq("store_id", store.id)
      .maybeSingle();
    if (attrErr || !attr) throw new Error("Attribute not found or not yours.");

    const { error } = await supabaseAdmin.from("attribute_values").delete().eq("id", valueId);
    if (error) throw error;

    revalidatePath("/dashboard/attributes");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateAttributeValue(valueId: string, formData: FormData): Promise<ActionResult> {
  try {
    valueId = validateId(valueId);
    const store = await getCurrentStore();

    const fields = validate(attributeValueSchema, {
      value: (formData.get("value") as string)?.trim() ?? "",
      label: (formData.get("label") as string)?.trim() || null,
      image_url: (formData.get("image_url") as string)?.trim() || null,
      description: (formData.get("description") as string)?.trim() || null,
    });

    // Verify the value's parent attribute belongs to this store
    const { data: av, error: fetchErr } = await supabaseAdmin
      .from("attribute_values")
      .select("id, attribute_id")
      .eq("id", valueId)
      .single();
    if (fetchErr || !av) throw new Error("Value not found.");

    const { data: attr, error: attrErr } = await supabaseAdmin
      .from("attributes")
      .select("id, name")
      .eq("id", av.attribute_id)
      .eq("store_id", store.id)
      .maybeSingle();
    if (attrErr || !attr) throw new Error("Attribute not found or not yours.");

    const { error } = await supabaseAdmin
      .from("attribute_values")
      .update({
        value: fields.value,
        label: fields.label,
        image_url: fields.image_url,
        description: fields.description,
      })
      .eq("id", valueId);

    if (error) throw error;

    // Translate user-facing text into enabled locales.
    // image_url is intentionally excluded — URLs are not language-specific.
    await syncTranslations({
      store,
      entityType: "attribute_value",
      entityId: valueId,
      fields: {
        value: fields.value,
        label: fields.label,
        description: fields.description,
      },
      categoryPath: attr.name,
    });

    revalidatePath("/dashboard/attributes");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function deleteAttribute(attributeId: string): Promise<ActionResult> {
  try {
    attributeId = validateId(attributeId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("attributes")
      .delete()
      .eq("id", attributeId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/attributes");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}
