"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slug";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { syncTranslations } from "@/lib/translation-sync";
import type { Store } from "@/lib/types";

const familyFieldsSchema = z.object({
  name: z.string().trim().min(1, "Family name is required").max(200, "Name is too long"),
  categoryId: z.string().uuid().nullable(),
  description: z.string().trim().max(5000, "Description is too long").nullable(),
  shortDescription: z.string().trim().max(500, "Short description is too long").nullable(),
  imageUrl: z.string().trim().max(2000, "Image URL is too long").nullable(),
  isFeatured: z.boolean(),
});

function readFamilyFields(formData: FormData) {
  const name = (formData.get("name") as string)?.trim() ?? "";
  const categoryId = (formData.get("category_id") as string) || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const shortDescription = (formData.get("short_description") as string)?.trim() || null;
  const imageUrl = (formData.get("image_url") as string)?.trim() || null;
  const isFeatured = formData.get("is_featured") === "on";

  return validate(familyFieldsSchema, {
    name,
    categoryId,
    description,
    shortDescription,
    imageUrl,
    isFeatured,
  });
}

export async function createProductFamily(formData: FormData): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const fields = readFamilyFields(formData);

    const { data: family, error } = await supabaseAdmin
      .from("product_families")
      .insert({
        store_id: store.id,
        category_id: fields.categoryId,
        name: fields.name,
        slug: slugify(fields.name),
        description: fields.description,
        short_description: fields.shortDescription,
        images: fields.imageUrl ? [fields.imageUrl] : [],
        is_featured: fields.isFeatured,
      })
      .select()
      .single();

    if (error) throw error;

    await syncFamilyTranslations(store, family.id, fields);
    revalidatePath("/dashboard/product-families");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

export async function updateProductFamily(familyId: string, formData: FormData): Promise<ActionResult> {
  try {
    familyId = validateId(familyId);
    const store = await getCurrentStore();
    const fields = readFamilyFields(formData);

    const { error } = await supabaseAdmin
      .from("product_families")
      .update({
        category_id: fields.categoryId,
        name: fields.name,
        description: fields.description,
        short_description: fields.shortDescription,
        images: fields.imageUrl ? [fields.imageUrl] : [],
        is_featured: fields.isFeatured,
      })
      .eq("id", familyId)
      .eq("store_id", store.id);

    if (error) throw error;

    await syncFamilyTranslations(store, familyId, fields);
    revalidatePath("/dashboard/product-families");
    revalidatePath("/dashboard/products");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

async function syncFamilyTranslations(
  store: Store,
  familyId: string,
  fields: { name: string; description: string | null; shortDescription: string | null }
) {
  await syncTranslations({
    store,
    entityType: "product_family",
    entityId: familyId,
    fields: {
      name: fields.name,
      description: fields.description,
      short_description: fields.shortDescription,
    },
  });
}

/**
 * Deleting a family never deletes or breaks the products in it -- the FK is
 * ON DELETE SET NULL, so every member product just goes back to standalone
 * (family_id null), exactly like a product that was never grouped at all.
 */
export async function deleteProductFamily(familyId: string): Promise<ActionResult> {
  try {
    familyId = validateId(familyId);
    const store = await getCurrentStore();

    const { error } = await supabaseAdmin
      .from("product_families")
      .delete()
      .eq("id", familyId)
      .eq("store_id", store.id);

    if (error) throw error;

    revalidatePath("/dashboard/product-families");
    revalidatePath("/dashboard/products");
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

const NEW_KEYWORDS = ["new", "ny", "one trip"];
const USED_KEYWORDS = ["used", "brugt"];
const REFURBISHED_KEYWORDS = ["refurb"];

/** Best-effort: if one of the selected axis values looks like a condition
 * word, use it to set the real `condition` column too (not just leave it in
 * `attributes`) -- same dual-representation already used for hand-entered
 * products, since Google Merchant sync reads the column, not the JSON. */
function guessCondition(values: string[]): "new" | "used" | "refurbished" {
  const joined = values.join(" ").toLowerCase();
  if (REFURBISHED_KEYWORDS.some((k) => joined.includes(k))) return "refurbished";
  if (USED_KEYWORDS.some((k) => joined.includes(k))) return "used";
  if (NEW_KEYWORDS.some((k) => joined.includes(k))) return "new";
  return "new";
}

async function uniqueSlug(base: string, storeId: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const { data } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("store_id", storeId)
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

/**
 * Bulk-creates one draft product per combination of the selected attribute
 * values -- e.g. Type [Standard, High Cube] x Condition [New, Used] x
 * Colour [Blue, Green] creates up to 8 products in one pass, each already
 * tagged with this family, the right attributes, and a suggested (fully
 * editable) name -- instead of creating each one by hand.
 *
 * Every generated product is a completely normal, independent product row
 * -- same as if it had been created through "New Product" one at a time.
 * Nothing about how products/Merchant sync/the storefront read this table
 * changes; this just automates the repetitive part of creating several at
 * once.
 *
 * Left for the operator to fill in afterward, deliberately not guessed:
 * price, images, description. Status starts as "draft" specifically so an
 * incomplete generated row can never accidentally sync to Google or appear
 * live on the storefront before someone's actually finished it.
 *
 * Combinations that already exist in this family (by exact attribute match)
 * are skipped, not duplicated -- safe to run again after adding a new
 * colour without recreating everything that's already there.
 */
export async function generateFamilyVariants(
  familyId: string,
  formData: FormData
): Promise<ActionResult<{ created: number; skipped: number }>> {
  try {
    familyId = validateId(familyId);
    const store = await getCurrentStore();

    const { data: family } = await supabaseAdmin
      .from("product_families")
      .select("*")
      .eq("id", familyId)
      .eq("store_id", store.id)
      .single();
    if (!family) return { success: false, error: "Family not found.", fieldErrors: {} };

    const attributeNames = formData.getAll("selected_attributes") as string[];
    const axes = attributeNames
      .map((attrName) => ({
        name: attrName,
        values: (formData.getAll(`values:${attrName}`) as string[]).filter(Boolean),
      }))
      .filter((axis) => axis.values.length > 0);

    if (axes.length === 0) {
      return { success: false, error: "Pick at least one attribute and at least one value.", fieldErrors: {} };
    }

    let combos: Record<string, string>[] = [{}];
    for (const axis of axes) {
      const next: Record<string, string>[] = [];
      for (const combo of combos) {
        for (const value of axis.values) {
          next.push({ ...combo, [axis.name]: value });
        }
      }
      combos = next;
    }

    const axisNames = axes.map((a) => a.name);
    const comboKey = (attrs: Record<string, string>) =>
      JSON.stringify(axisNames.map((n) => attrs?.[n] ?? "").join(" "));

    const { data: siblings } = await supabaseAdmin
      .from("products")
      .select("attributes")
      .eq("family_id", familyId);
    const existingKeys = new Set((siblings ?? []).map((p) => comboKey(p.attributes as Record<string, string>)));

    // A representative sibling's currency, if one exists, so generated
    // drafts aren't left on a currency mismatched with the rest of the
    // family -- purely a convenience default, fully editable per product.
    const { data: currencySample } = await supabaseAdmin
      .from("products")
      .select("currency")
      .eq("family_id", familyId)
      .limit(1)
      .maybeSingle();
    const defaultCurrency = currencySample?.currency ?? "USD";

    let created = 0;
    let skipped = 0;

    for (const combo of combos) {
      if (existingKeys.has(comboKey(combo))) {
        skipped += 1;
        continue;
      }

      const suffix = axisNames.map((n) => combo[n]).join(", ");
      const name = `${family.name} — ${suffix}`;
      const slug = await uniqueSlug(slugify(name), store.id);
      const condition = guessCondition(Object.values(combo));

      const { error } = await supabaseAdmin.from("products").insert({
        store_id: store.id,
        family_id: familyId,
        category_id: family.category_id,
        name,
        slug,
        attributes: combo,
        status: "draft",
        condition,
        currency: defaultCurrency,
        stock_quantity: 0,
        images: [],
        image_alts: [],
      });
      if (error) throw error;
      created += 1;
    }

    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/product-families");
    return ok({ created, skipped });
  } catch (err) {
    return toActionResult(err);
  }
}
