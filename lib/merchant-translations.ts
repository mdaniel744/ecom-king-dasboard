export type TranslatedFields = {
  name: string;
  description: string;
  short_description: string | null;
  slug: string;
};

export type MerchantTranslationRow = {
  entity_id: string;
  locale: string;
  field_name: string;
  value: string;
};

export const MERCHANT_TRANSLATION_FIELDS = [
  "name", "description", "short_description", "google_title", "google_description", "slug",
] as const;

export class MerchantTranslationError extends Error {}

const PRODUCT_BATCH_SIZE = 50;
const PAGE_SIZE = 500;
const CONCURRENCY = 3;

/** Bound both request URL size and response size; never return a partial read. */
export async function loadMerchantTranslationRows(
  productIds: string[],
  fetchPage: (ids: string[], from: number, to: number) => Promise<{
    data: MerchantTranslationRow[] | null;
    error: { message: string } | null;
  }>
): Promise<MerchantTranslationRow[]> {
  const ids = [...new Set(productIds)];
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += PRODUCT_BATCH_SIZE) {
    batches.push(ids.slice(start, start + PRODUCT_BATCH_SIZE));
  }
  const results: MerchantTranslationRow[][] = new Array(batches.length);
  let cursor = 0;
  async function worker() {
    while (cursor < batches.length) {
      const index = cursor++;
      const rows: MerchantTranslationRow[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const page = await fetchPage(batches[index], from, from + PAGE_SIZE - 1);
        if (page.error || !page.data) {
          throw new MerchantTranslationError("Product translations could not be loaded. Retry the feed after checking the database connection.");
        }
        rows.push(...page.data);
        if (page.data.length < PAGE_SIZE) break;
      }
      results[index] = rows;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  return results.flat();
}

type MerchantProductText = TranslatedFields & {
  google_title: string | null;
  google_description: string | null;
};

/** Values must be plain text. Only the URL slug may fall back across languages. */
export function selectMerchantTranslation(
  product: MerchantProductText,
  sourceLocale: string,
  locale: string,
  translations: ReadonlyMap<string, string>
): TranslatedFields | null {
  if (locale === sourceLocale) {
    return {
      name: product.google_title?.trim() || product.name,
      description: product.google_description?.trim() || product.description || product.name,
      short_description: product.short_description,
      slug: product.slug,
    };
  }
  const value = (field: string) => translations.get(field)?.trim() || "";
  const name = (product.google_title?.trim() ? value("google_title") : "") || value("name");
  const translatedOverride = product.google_description?.trim() ? value("google_description") : "";
  let description = translatedOverride || value("description");
  const sourceDescription = translatedOverride ? product.google_description : product.description;
  const comparable = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
  // A long verbatim source paragraph is not a translation. Short identical
  // brand/model names are legitimate and must not be rejected by this check.
  if (sourceLocale.split("-")[0] !== locale.split("-")[0] && sourceDescription &&
      description.split(/\s+/).length >= 12 && comparable(description) === comparable(sourceDescription)) {
    return null;
  }
  // Preserve the existing title-only behaviour for products with no source
  // description at all, but use the translated title in the requested language.
  if (!product.google_description?.trim() && !product.description?.trim()) {
    description ||= name;
  }
  if (!name || !description) return null;
  return {
    name,
    description,
    short_description: value("short_description") || null,
    slug: value("slug") || product.slug,
  };
}
