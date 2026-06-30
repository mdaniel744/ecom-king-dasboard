"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";

const attributeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  values: z.array(z.string().trim().min(1).max(200)).max(200),
});

export async function createAttribute(formData: FormData) {
  const store = await getCurrentStore();
  const nameRaw = (formData.get("name") as string)?.trim() ?? "";
  const valuesRaw = (formData.get("values") as string) || "";
  const valuesArr = valuesRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const { name, values } = validate(attributeSchema, { name: nameRaw, values: valuesArr });

  const { data: attribute, error } = await supabaseAdmin
    .from("attributes")
    .insert({ store_id: store.id, name })
    .select()
    .single();

  if (error) throw new Error(`Failed to create attribute: ${error.message}`);

  if (values.length) {
    const { error: valuesError } = await supabaseAdmin
      .from("attribute_values")
      .insert(values.map((value) => ({ attribute_id: attribute.id, value })));

    if (valuesError) {
      throw new Error(`Failed to create attribute values: ${valuesError.message}`);
    }
  }

  revalidatePath("/dashboard/attributes");
}

export async function deleteAttribute(attributeId: string) {
  attributeId = validateId(attributeId);
  const store = await getCurrentStore();

  const { error } = await supabaseAdmin
    .from("attributes")
    .delete()
    .eq("id", attributeId)
    .eq("store_id", store.id);

  if (error) throw new Error(`Failed to delete attribute: ${error.message}`);

  revalidatePath("/dashboard/attributes");
}
