"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slug";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { syncTranslations } from "@/lib/translation-sync";
import { getAttributeDefs } from "@/lib/attribute-defs";
import type { ProductFamily, Store } from "@/lib/types";

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

type FamilyFields = ReturnType<typeof readFamilyFields>;

async function insertProductFamily(store: Store, fields: FamilyFields): Promise<ProductFamily> {
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
  return family as ProductFamily;
}

export async function createProductFamily(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const store = await getCurrentStore();
    const family = await insertProductFamily(store, readFamilyFields(formData));

    revalidatePath("/dashboard/product-families");
    return ok({ id: family.id });
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
    revalidatePath(`/dashboard/product-families/${familyId}`);
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

function revalidateProductFamilyAssignment(familyId: string) {
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/product-families");
  revalidatePath(`/dashboard/product-families/${familyId}`);
}

export async function removeProductFromFamily(
  productId: string,
  familyId: string
): Promise<ActionResult> {
  try {
    productId = validateId(productId);
    familyId = validateId(familyId);
    const store = await getCurrentStore();

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("store_id", store.id)
      .eq("family_id", familyId)
      .maybeSingle();

    if (!product) throw new Error("This product is no longer in the selected family.");

    const { error } = await supabaseAdmin
      .from("products")
      .update({ family_id: null })
      .eq("id", productId)
      .eq("store_id", store.id)
      .eq("family_id", familyId);

    if (error) throw error;

    revalidateProductFamilyAssignment(familyId);
    return ok();
  } catch (err) {
    return toActionResult(err);
  }
}

const NEW_KEYWORDS = ["new", "ny", "one trip"];
const USED_KEYWORDS = ["used", "brugt"];
const REFURBISHED_KEYWORDS = ["refurb"];
const MAX_VARIANTS_PER_GENERATION = 100;

type VariantAxis = {
  name: string;
  values: string[];
};

function readVariantAxes(formData: FormData): VariantAxis[] {
  const attributeNames = Array.from(
    new Set(
      (formData.getAll("selected_attributes") as string[])
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );

  return attributeNames
    .map((name) => ({
      name,
      values: Array.from(
        new Set(
          (formData.getAll(`values:${name}`) as string[])
            .map((value) => value.trim())
            .filter(Boolean)
        )
      ),
    }))
    .filter((axis) => axis.values.length > 0);
}

async function validateVariantAxes(storeId: string, axes: VariantAxis[]): Promise<VariantAxis[]> {
  if (axes.length === 0) {
    throw new Error("Pick at least one product attribute and at least one value.");
  }

  const attributeDefs = await getAttributeDefs(storeId);
  const allowedByName = new Map(
    attributeDefs.map((attribute) => [attribute.name, new Set(attribute.values)])
  );

  for (const axis of axes) {
    const allowedValues = allowedByName.get(axis.name);
    if (!allowedValues) {
      throw new Error(`The attribute “${axis.name}” is no longer available.`);
    }
    const invalidValue = axis.values.find((value) => !allowedValues.has(value));
    if (invalidValue) {
      throw new Error(`The value “${invalidValue}” is no longer available for ${axis.name}.`);
    }
  }

  const combinationCount = axes.reduce((total, axis) => total * axis.values.length, 1);
  if (combinationCount > MAX_VARIANTS_PER_GENERATION) {
    throw new Error(
      `That selection creates ${combinationCount} variations. Generate no more than ${MAX_VARIANTS_PER_GENERATION} at a time.`
    );
  }

  return axes;
}

function buildCombinations(axes: VariantAxis[]): Record<string, string>[] {
  let combinations: Record<string, string>[] = [{}];

  for (const axis of axes) {
    combinations = combinations.flatMap((combination) =>
      axis.values.map((value) => ({ ...combination, [axis.name]: value }))
    );
  }

  return combinations;
}

/** Best-effort: if one of the selected axis values looks like a condition
 * word, use it to set the real `condition` column too (not just leave it in
 * `attributes`) -- same dual-representation already used for hand-entered
 * products, since Google Merchant sync reads the column, not the JSON. */
function guessCondition(values: string[]): "new" | "used" | "refurbished" {
  const joined = values.join(" ").toLowerCase();
  if (REFURBISHED_KEYWORDS.some((keyword) => joined.includes(keyword))) return "refurbished";
  if (USED_KEYWORDS.some((keyword) => joined.includes(keyword))) return "used";
  if (NEW_KEYWORDS.some((keyword) => joined.includes(keyword))) return "new";
  return "new";
}

async function getStoreProductSlugs(storeId: string): Promise<Set<string>> {
  const slugs = new Set<string>();
  const pageSize = 1_000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("slug")
      .eq("store_id", storeId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const page = data ?? [];
    page.forEach((product) => slugs.add(product.slug));
    if (page.length < pageSize) break;
  }

  return slugs;
}

function reserveUniqueSlug(base: string, usedSlugs: Set<string>) {
  let candidate = base;
  let suffix = 2;
  while (usedSlugs.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedSlugs.add(candidate);
  return candidate;
}

async function generateVariantsForFamily(
  store: Store,
  family: ProductFamily,
  axes: VariantAxis[]
): Promise<{ created: number; skipped: number }> {
  const combinations = buildCombinations(axes);
  const axisNames = axes.map((axis) => axis.name);
  const comboKey = (attributes: Record<string, string>) =>
    axisNames.map((name) => attributes?.[name] ?? "").join("\u001f");

  const { data: siblings } = await supabaseAdmin
    .from("products")
    .select("attributes")
    .eq("store_id", store.id)
    .eq("family_id", family.id);
  const existingKeys = new Set(
    (siblings ?? []).map((product) => comboKey(product.attributes as Record<string, string>))
  );

  const { data: currencySample } = await supabaseAdmin
    .from("products")
    .select("currency")
    .eq("store_id", store.id)
    .eq("family_id", family.id)
    .limit(1)
    .maybeSingle();
  const defaultCurrency = currencySample?.currency ?? "USD";
  const usedSlugs = await getStoreProductSlugs(store.id);
  const newProducts: Array<Record<string, unknown>> = [];
  let skipped = 0;

  for (const combination of combinations) {
    if (existingKeys.has(comboKey(combination))) {
      skipped += 1;
      continue;
    }

    const suffix = axisNames.map((name) => combination[name]).join(", ");
    const name = `${family.name} — ${suffix}`;
    const slug = reserveUniqueSlug(slugify(name), usedSlugs);

    newProducts.push({
      store_id: store.id,
      family_id: family.id,
      category_id: family.category_id,
      name,
      slug,
      attributes: combination,
      status: "draft",
      condition: guessCondition(Object.values(combination)),
      currency: defaultCurrency,
      stock_quantity: 0,
      images: [],
      image_titles: [],
      image_alts: [],
      image_descriptions: [],
    });
  }

  if (newProducts.length > 0) {
    const { error } = await supabaseAdmin.from("products").insert(newProducts);
    if (error) throw error;
  }

  return { created: newProducts.length, skipped };
}

function revalidateFamilyPages(familyId: string) {
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/product-families");
  revalidatePath(`/dashboard/product-families/${familyId}`);
  revalidatePath(`/dashboard/product-families/${familyId}/generate`);
}

export async function createProductFamilyWithVariants(
  formData: FormData
): Promise<ActionResult<{ familyId: string; created: number; skipped: number }>> {
  try {
    const store = await getCurrentStore();
    const axes = await validateVariantAxes(store.id, readVariantAxes(formData));
    const family = await insertProductFamily(store, readFamilyFields(formData));
    const result = await generateVariantsForFamily(store, family, axes);

    revalidateFamilyPages(family.id);
    return ok({ familyId: family.id, ...result });
  } catch (err) {
    return toActionResult(err);
  }
}

/**
 * Creates one independent draft product for every selected attribute
 * combination. Existing combinations in the same family are skipped.
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
      .maybeSingle();
    if (!family) return { success: false, error: "Family not found.", fieldErrors: {} };

    const axes = await validateVariantAxes(store.id, readVariantAxes(formData));
    const result = await generateVariantsForFamily(store, family as ProductFamily, axes);

    revalidateFamilyPages(familyId);
    return ok(result);
  } catch (err) {
    return toActionResult(err);
  }
}

const bulkVariantActionSchema = z.object({
  familyId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).min(1).max(500),
  operation: z.enum(["draft", "delete"]),
});

export async function manageFamilyVariants(input: {
  familyId: string;
  productIds: string[];
  operation: "draft" | "delete";
}): Promise<ActionResult<{ affected: number }>> {
  try {
    const parsed = bulkVariantActionSchema.parse({
      ...input,
      productIds: Array.from(new Set(input.productIds)),
    });
    const store = await getCurrentStore();

    const { data: family } = await supabaseAdmin
      .from("product_families")
      .select("id")
      .eq("id", parsed.familyId)
      .eq("store_id", store.id)
      .maybeSingle();
    if (!family) throw new Error("Product family not found.");

    const query =
      parsed.operation === "draft"
        ? supabaseAdmin
            .from("products")
            .update({
              status: "draft",
              google_sync_status: "not_synced",
              google_product_id: null,
              google_sync_error: null,
            })
        : supabaseAdmin.from("products").delete();

    const { data: affectedRows, error } = await query
      .eq("store_id", store.id)
      .eq("family_id", parsed.familyId)
      .in("id", parsed.productIds)
      .select("id");
    if (error) throw error;

    revalidateFamilyPages(parsed.familyId);
    return ok({ affected: affectedRows?.length ?? 0 });
  } catch (err) {
    return toActionResult(err);
  }
}
