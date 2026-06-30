"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function createAttribute(formData: FormData) {
  const store = await getCurrentStore();
  const name = (formData.get("name") as string).trim();
  const valuesRaw = (formData.get("values") as string) || "";
  const values = valuesRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

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
  const store = await getCurrentStore();

  const { error } = await supabaseAdmin
    .from("attributes")
    .delete()
    .eq("id", attributeId)
    .eq("store_id", store.id);

  if (error) throw new Error(`Failed to delete attribute: ${error.message}`);

  revalidatePath("/dashboard/attributes");
}
