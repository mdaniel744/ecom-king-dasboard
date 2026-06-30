import { supabaseAdmin } from "@/lib/supabase-admin";

export type AttributeDef = {
  name: string;
  values: string[];
};

/**
 * Store-defined attribute vocabulary (name + saved values), entered by
 * the operator via the Attributes page. Feeds the product form's
 * attribute-name autocomplete (every name returned here, regardless of
 * whether it has values yet) and the matching value autocomplete for
 * whichever name has saved values — niche vocabulary (Color, Size,
 * Dosage Form, whatever a given store needs) lives here, never
 * hardcoded in shared platform code.
 */
export async function getAttributeDefs(storeId: string): Promise<AttributeDef[]> {
  const { data: attributes } = await supabaseAdmin
    .from("attributes")
    .select("id, name")
    .eq("store_id", storeId)
    .order("name");

  if (!attributes?.length) return [];

  const { data: values } = await supabaseAdmin
    .from("attribute_values")
    .select("attribute_id, value")
    .in(
      "attribute_id",
      attributes.map((a) => a.id)
    );

  const valuesByAttribute = new Map<string, string[]>();
  (values ?? []).forEach((v) => {
    const list = valuesByAttribute.get(v.attribute_id) ?? [];
    list.push(v.value);
    valuesByAttribute.set(v.attribute_id, list);
  });

  return attributes.map((attr) => ({
    name: attr.name,
    values: valuesByAttribute.get(attr.id) ?? [],
  }));
}
