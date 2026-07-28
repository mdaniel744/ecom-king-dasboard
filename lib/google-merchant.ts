import "server-only";
import { JWT } from "google-auth-library";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Product, ProductCondition, Store } from "@/lib/types";
import { checkProductForMerchant, hasBlockingIssues } from "@/lib/merchant-rules";

const MERCHANT_API_BASE = "https://merchantapi.googleapis.com/products/v1";

const CONDITION_MAP: Record<ProductCondition, string> = {
  new: "NEW",
  used: "USED",
  refurbished: "REFURBISHED",
};

export class GoogleMerchantConfigError extends Error {}
export class GoogleMerchantValidationError extends Error {}

function getAccountId(store: Store): string {
  if (!store.google_merchant_id) {
    throw new GoogleMerchantConfigError(
      "This store has no Merchant Center ID set. Add it in Settings before syncing to Google."
    );
  }
  return store.google_merchant_id;
}

function getDataSourceName(store: Store, accountId: string): string {
  if (!store.google_merchant_datasource_id) {
    throw new GoogleMerchantConfigError(
      "This store has no Merchant Center data source ID set. Add it in Settings before syncing to Google."
    );
  }
  return `accounts/${accountId}/dataSources/${store.google_merchant_datasource_id}`;
}

function getServiceAccountCredentials(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new GoogleMerchantConfigError(
      "GOOGLE_MERCHANT_SERVICE_ACCOUNT_KEY is not set. Add the service account JSON key to .env."
    );
  }

  try {
    // Accept either raw JSON or base64-encoded JSON (base64 is safer for hosting env vars)
    const decoded = raw.trimStart().startsWith("{")
      ? raw
      : Buffer.from(raw.trim(), "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("missing client_email or private_key");
    }
    return parsed;
  } catch {
    throw new GoogleMerchantConfigError(
      "GOOGLE_MERCHANT_SERVICE_ACCOUNT_KEY is not valid JSON for a Google service account key."
    );
  }
}

let cachedClient: JWT | null = null;

function getAuthClient(): JWT {
  if (cachedClient) return cachedClient;

  const credentials = getServiceAccountCredentials();
  cachedClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/content"],
  });
  return cachedClient;
}

/**
 * A store's delivery markets (Google feed labels) and content locales,
 * combined into every market x locale pair a product must be individually
 * submitted to. Source language is always included alongside enabled
 * translation targets, and de-duplicated in case a store's enabled_locales
 * accidentally includes its own source language.
 */
function getMarketsAndLocales(store: Store): { markets: string[]; locales: string[] } {
  const markets =
    store.google_feed_labels && store.google_feed_labels.length > 0
      ? store.google_feed_labels
      : [store.google_feed_label];

  const sourceLocale = store.google_content_language || "en";
  const locales = Array.from(
    new Set([sourceLocale, ...(store.enabled_locales ?? [])])
  );

  return { markets, locales };
}

export type TranslatedFields = { name: string; description: string; short_description: string | null };

/**
 * Fetches every translation row for this product once, then returns a
 * per-locale lookup of translated name/description/short_description,
 * falling back to the product's own (source-language) fields when a
 * translation row is missing for a given locale/field — same fallback rule
 * storefronts already use, applied here so Google never gets a blank field.
 *
 * Exported for reuse by the XML feed route (app/api/feeds/.../google.xml) —
 * both sync paths must build translated text the exact same way, or a
 * store's API-push and XML-feed listings could disagree.
 */
export async function getTranslationsByLocale(
  store: Store,
  product: Product
): Promise<Map<string, TranslatedFields>> {
  const sourceFields: TranslatedFields = {
    name: product.name,
    description: product.description ?? product.name,
    short_description: product.short_description,
  };

  const map = new Map<string, TranslatedFields>();
  map.set(store.google_content_language, sourceFields);

  const { data: rows } = await supabaseAdmin
    .from("translations")
    .select("locale, field_name, value")
    .eq("store_id", store.id)
    .eq("entity_type", "product")
    .eq("entity_id", product.id);

  for (const row of rows ?? []) {
    if (!map.has(row.locale)) map.set(row.locale, { ...sourceFields });
    const entry = map.get(row.locale)!;
    if (row.field_name === "name") entry.name = row.value;
    if (row.field_name === "description") entry.description = row.value;
    if (row.field_name === "short_description") entry.short_description = row.value;
  }

  return map;
}

/**
 * Builds this product's URL for a given locale. The locale-prefix
 * convention (no prefix for the store's source language, /{locale}
 * otherwise) is a fixed rule every storefront agent is briefed to follow —
 * see the onboarding playbook. The path segment after the domain/prefix
 * (e.g. "products") varies per store and comes from stores.product_url_path.
 *
 * Exported — the XML feed route builds links the exact same way, so a
 * product's link is identical whether it reached Google via API push or
 * via the XML feed.
 */
export function buildProductLink(store: Store, product: Product, locale: string): string {
  const base = store.domain!.startsWith("http") ? store.domain! : `https://${store.domain}`;
  const trimmedBase = base.replace(/\/$/, "");
  const localePrefix = locale === store.google_content_language ? "" : `/${locale}`;
  const path = store.product_url_path.replace(/^\/|\/$/g, "");
  return `${trimmedBase}${localePrefix}/${path}/${product.slug}`;
}

function buildProductInput(
  store: Store,
  product: Product,
  locale: string,
  feedLabel: string,
  text: TranslatedFields,
  productType?: string | null
) {
  const issues = checkProductForMerchant(product, store);
  if (hasBlockingIssues(issues)) {
    const summary = issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message)
      .join(" ");
    throw new GoogleMerchantValidationError(summary);
  }

  // Google's actual rule: a valid identifier is a GTIN, or brand+MPN
  // together. Brand alone is not sufficient (real-world feeds we compared
  // against use brand+MPN with no GTIN at all, which is what this matches).
  const hasIdentifier = Boolean(product.gtin || (product.brand && product.mpn));

  return {
    offerId: product.id,
    contentLanguage: locale,
    feedLabel,
    productAttributes: {
      title: text.name,
      description: text.description,
      link: buildProductLink(store, product, locale),
      imageLink: product.images[0],
      additionalImageLinks: product.images.slice(1, 10),
      availability: product.status === "active" ? "IN_STOCK" : "OUT_OF_STOCK",
      condition: CONDITION_MAP[product.condition],
      price: {
        amountMicros: String(Math.round(product.price! * 1_000_000)),
        currencyCode: product.currency,
      },
      salePrice: product.sale_price
        ? {
            amountMicros: String(Math.round(product.sale_price * 1_000_000)),
            currencyCode: product.currency,
          }
        : undefined,
      brand: product.brand ?? undefined,
      gtins: product.gtin ? [product.gtin] : undefined,
      mpn: product.mpn ?? undefined,
      googleProductCategory: product.google_product_category ?? undefined,
      productTypes: productType ? [productType] : undefined,
      // Per Google's spec: explicitly declare no identifier rather than
      // silently omitting gtin/brand/mpn, which otherwise risks disapproval
      // for "missing identifier" on products that legitimately have none.
      identifierExists: hasIdentifier ? undefined : false,
    },
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Small pacing delay between a single product's own market x locale
// submissions, so a store with several markets/locales doesn't fire a burst
// of simultaneous requests against the shared service account's quota.
const COMBO_DELAY_MS = 80;

/**
 * Upserts a product into Google Merchant Center — once per (market x
 * locale) combination the store is configured for. productInputs.insert is
 * an upsert keyed by (contentLanguage, feedLabel, offerId), so create and
 * update use the same call, and the same offerId across combinations
 * produces one distinct listing per market/language, not a conflict.
 *
 * All combinations must succeed for this to resolve; if any fail, throws
 * with every failure's reason combined, so the caller's single
 * google_sync_error field stays a complete picture rather than only the
 * first or last failure.
 */
export async function upsertGoogleProduct(
  store: Store,
  product: Product,
  productType?: string | null
) {
  const accountId = getAccountId(store);
  const dataSource = getDataSourceName(store, accountId);
  const client = getAuthClient();
  const { markets, locales } = getMarketsAndLocales(store);
  const textByLocale = await getTranslationsByLocale(store, product);

  const results: { market: string; locale: string; name?: string; error?: string }[] = [];

  for (const feedLabel of markets) {
    for (const locale of locales) {
      const text = textByLocale.get(locale) ?? textByLocale.get(store.google_content_language)!;
      try {
        const body = buildProductInput(store, product, locale, feedLabel, text, productType);
        const res = await client.request({
          url: `${MERCHANT_API_BASE}/accounts/${accountId}/productInputs:insert?dataSource=${encodeURIComponent(dataSource)}`,
          method: "POST",
          data: body,
          timeout: 25000,
        });
        results.push({ market: feedLabel, locale, name: (res.data as { name: string }).name });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ market: feedLabel, locale, error: message });
      }
      await sleep(COMBO_DELAY_MS);
    }
  }

  const failures = results.filter((r) => r.error);
  if (failures.length > 0) {
    const summary = failures.map((f) => `[${f.locale}/${f.market}] ${f.error}`).join(" | ");
    throw new Error(summary);
  }

  // The source-language listing in the first configured market is stored as
  // "the" reference id for display — informational only, not used for sync
  // logic (all combinations are re-submitted as a full upsert every time).
  const primary =
    results.find((r) => r.locale === store.google_content_language && r.market === markets[0]) ??
    results[0];
  return { name: primary?.name ?? "" };
}

export async function deleteGoogleProduct(store: Store, productId: string) {
  const accountId = getAccountId(store);
  const dataSource = getDataSourceName(store, accountId);
  const client = getAuthClient();
  const { markets, locales } = getMarketsAndLocales(store);

  for (const feedLabel of markets) {
    for (const locale of locales) {
      const productInputName = `${locale}~${feedLabel}~${productId}`;
      try {
        await client.request({
          url: `${MERCHANT_API_BASE}/accounts/${accountId}/productInputs/${productInputName}?dataSource=${encodeURIComponent(dataSource)}`,
          method: "DELETE",
          timeout: 25000,
        });
      } catch {
        // Best-effort per combination — a listing that was never actually
        // submitted for this market/locale will 404 on delete, which is
        // expected, not a failure worth surfacing.
      }
      await sleep(COMBO_DELAY_MS);
    }
  }
}
