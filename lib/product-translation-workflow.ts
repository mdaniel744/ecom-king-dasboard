import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateText } from "@/lib/translate";
import { syncTranslations, type TranslationSyncSummary } from "@/lib/translation-sync";
import {
  PRODUCT_CONTENT_FIELDS,
  resolveIncomingProductLocale,
  usesKarivProductLanguagePolicy,
  type ProductContentField,
  type ProductContentValues,
} from "@/lib/product-content-language";
import type { Product, Store } from "@/lib/types";

type IncomingTranslation = {
  fieldName: ProductContentField;
  locale: string;
  value: string;
};

export type PreparedProductContent = {
  actualLocale: string;
  primary: ProductContentValues;
  incomingTranslations: IncomingTranslation[];
};

export function productContentValues(product: Pick<Product, ProductContentField>): ProductContentValues {
  return Object.fromEntries(
    PRODUCT_CONTENT_FIELDS.map((field) => [field, product[field] ?? null])
  ) as ProductContentValues;
}

export function changedProductContentFields(
  before: Partial<ProductContentValues> | null | undefined,
  after: ProductContentValues
): ProductContentField[] {
  if (!before) return [];
  return PRODUCT_CONTENT_FIELDS.filter(
    (field) => String(before[field] ?? "").trim() !== String(after[field] ?? "").trim()
  );
}

/**
 * Kariv's primary product columns follow the tenant's configured source
 * language (English). If an operator explicitly writes/imports in an enabled
 * target language, translate that content back to English before mutating
 * the product row and preserve the operator's original target-language copy.
 * Other tenants retain the existing source-language behaviour unchanged.
 */
export async function prepareProductContentForSave({
  store,
  declaredLocale,
  fields,
  categoryPath,
}: {
  store: Store;
  declaredLocale?: string | null;
  fields: ProductContentValues;
  categoryPath?: string | null;
}): Promise<PreparedProductContent> {
  const sourceLocale = store.google_content_language.trim().toLowerCase() || "en";
  const actualLocale = resolveIncomingProductLocale({ store, declaredLocale, fields });
  if (!usesKarivProductLanguagePolicy(store) || actualLocale === sourceLocale) {
    return { actualLocale, primary: fields, incomingTranslations: [] };
  }

  const primary = { ...fields };
  const incomingTranslations: IncomingTranslation[] = [];
  for (const fieldName of PRODUCT_CONTENT_FIELDS) {
    const value = fields[fieldName]?.trim();
    if (!value) continue;
    primary[fieldName] = await translateText({
      text: value,
      sourceLocale: actualLocale,
      targetLocale: sourceLocale,
      fieldRole: fieldName,
      categoryPath,
      storeId: store.id,
      isHtml: fieldName === "description",
    });
    incomingTranslations.push({ fieldName, locale: actualLocale, value });
  }

  return { actualLocale, primary, incomingTranslations };
}

/** Store the operator's declared-language copy without touching other rows. */
export async function saveIncomingProductTranslations(
  store: Store,
  productId: string,
  translations: IncomingTranslation[]
) {
  if (translations.length === 0) return;
  const { error } = await supabaseAdmin.from("translations").upsert(
    translations.map((translation) => ({
      store_id: store.id,
      entity_type: "product",
      entity_id: productId,
      field_name: translation.fieldName,
      locale: translation.locale,
      value: translation.value,
      // This is the operator/import file's original copy, not generated text.
      translator: "human",
    })),
    { onConflict: "entity_type,entity_id,field_name,locale" }
  );
  if (error) throw new Error(`Product translations could not be saved: ${error.message}`);
  // Best-effort because older deployments may not have this optional column.
  await supabaseAdmin
    .from("translations")
    .update({ needs_review: false })
    .eq("store_id", store.id)
    .eq("entity_type", "product")
    .eq("entity_id", productId)
    .in("locale", [...new Set(translations.map((translation) => translation.locale))]);
}

export async function syncProductTranslations(
  store: Store,
  product: Product,
  options?: { onlyMissing?: boolean; sourceChangedFields?: ProductContentField[] }
): Promise<TranslationSyncSummary> {
  let categoryPath: string | null = null;
  if (product.category_id) {
    const { data: category } = await supabaseAdmin
      .from("categories")
      .select("name, parent_id")
      .eq("id", product.category_id)
      .eq("store_id", store.id)
      .maybeSingle();
    if (category?.parent_id) {
      const { data: parent } = await supabaseAdmin
        .from("categories")
        .select("name")
        .eq("id", category.parent_id)
        .eq("store_id", store.id)
        .maybeSingle();
      categoryPath = parent ? `${parent.name} > ${category.name}` : category.name;
    } else {
      categoryPath = category?.name ?? null;
    }
  }

  return syncTranslations({
    store,
    entityType: "product",
    entityId: product.id,
    categoryPath,
    htmlFields: ["description"],
    onlyMissing: options?.onlyMissing,
    sourceChangedFields: options?.sourceChangedFields,
    fields: productContentValues(product),
  });
}
