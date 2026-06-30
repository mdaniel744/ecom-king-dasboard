"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";

const attributeSchema = z.object({
  name: z.string().trim().min(1, "Attribute name is required").max(200, "Name is too long"),
  values: z.array(z.string().trim().min(1).max(200, "Each value must be under 200 characters")).max(200, "Maximum 200 values per attribute"),
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

    if (values.length) {
      const { error: valuesError } = await supabaseAdmin
        .from("attribute_values")
        .insert(values.map((value) => ({ attribute_id: attribute.id, value })));

      if (valuesError) throw valuesError;
    }

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
