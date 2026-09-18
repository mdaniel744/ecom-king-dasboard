import "server-only";
import { JWT } from "google-auth-library";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Product, ProductCondition, Store } from "@/lib/types";
import { checkProductForMerchant, hasBlockingIssues } from "@/lib/merchant-rules";
import { stripHtml } from "@/lib/html";
import { convertPriceForMarket } from "@/lib/market-pricing";
import { defaultLocaleForMarket } from "@/lib/merchant-locales";
import { resolveProductMpn } from "@/lib/product-identifiers";
import {
  loadMerchantTranslationRows,
  MERCHANT_TRANSLATION_FIELDS,
  selectMerchantTranslation,
  type TranslatedFields,
} from "@/lib/merchant-translations";

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
 * A store's delivery markets (Google feed labels) paired with the locale(s)
 * actually submitted to Google for each one. Source language is always
 * included.
 *
 * Locales come from google_push_locales, NOT enabled_locales directly —
 * those are two separate settings. enabled_locales controls what gets
 * AI-translated (for the storefront); google_push_locales is the subset of
 * those a store has explicitly opted to submit to Google. Empty
 * google_push_locales means nothing extra has been opted in yet, so only
 * the source language is pushed — it must NEVER fall back to enabled_locales
 * (every translated language), since leaving every box unchecked in
 * Settings is the user's explicit "don't push these yet" signal, not "push
 * all of them." An earlier version fell back to enabled_locales here, which
 * silently submitted every translated language to Merchant Center the
 * moment a store enabled a translation, regardless of what was actually
 * checked under Push to Google.
 * The XML feed (Settings page's Feed URL card) intentionally does NOT use
 * this function — it still enumerates every enabled_locales combo, since a
 * store picks which feed URLs to actually add to Merchant Center by hand.
 *
 * A single-market store has nothing to disambiguate: every pushed locale is
 * a legitimate variant of that one market (STF, confirmed live: one NL
 * market, four languages, all real listings a Dutch-market shopper might
 * search in) — every locale still pairs with the one market. A multi-market
 * store instead pairs each market with only its own matching locale
 * (falling back to the source locale if no pushed locale matches that
 * market's default), rather than crossing every locale into every market.
 * Without this, Olborg (DE + PL markets) had Polish-language listings
 * submitted to the German market, and — once German was actually pushed —
 * would have gained German-language listings submitted to the Polish
 * market too, neither of which reflects what either market's shoppers
 * should see.
 */
function getMarketLocaleCombos(store: Store): { market: string; locale: string }[] {
  const markets =
    store.google_feed_labels && store.google_feed_labels.length > 0
      ? store.google_feed_labels
      : [store.google_feed_label];

  const sourceLocale = store.google_content_language || "en";
  const pushLocales = store.google_push_locales ?? [];
  const allLocales = Array.from(new Set([sourceLocale, ...pushLocales]));

  if (markets.length === 1) {
    return allLocales.map((locale) => ({ market: markets[0], locale }));
  }

  return markets.map((market) => ({
    market,
    locale: defaultLocaleForMarket(market, allLocales) ?? sourceLocale,
  }));
}

export type { TranslatedFields } from "@/lib/merchant-translations";

/**
 * Both Google submission paths require complete translated title/description
 * pairs. A missing target-language field must never silently become English.
 */
export async function getTranslationsByLocale(
  store: Store,
  product: Product
): Promise<Map<string, TranslatedFields>> {
  const batch = await getTranslationsByLocaleBatch(store, [product]);
  return batch.get(product.id)!;
}

/**
 * Load bounded product batches and every response page. Large IN filters
 * exceed HTTP URL limits, while unpaginated responses silently stop at the
 * database row limit. Restrict XML requests to their requested language.
 */
export async function getTranslationsByLocaleBatch(
  store: Store,
  products: Product[],
  requestedLocales?: string[]
): Promise<Map<string, Map<string, TranslatedFields>>> {
  const result = new Map<string, Map<string, TranslatedFields>>();
  if (products.length === 0) return result;

  const sourceLocale = store.google_content_language.trim().toLowerCase();
  const locales = [...new Set((requestedLocales ?? [
    ...(store.enabled_locales ?? []), ...(store.google_push_locales ?? []),
  ]).map((locale) => locale.trim().toLowerCase()))].filter((locale) => locale && locale !== sourceLocale);
  const rows = locales.length ? await loadMerchantTranslationRows(
    products.map((product) => product.id),
    async (ids, from, to) => await supabaseAdmin
      .from("translations")
      .select("entity_id, locale, field_name, value")
      .eq("store_id", store.id)
      .eq("entity_type", "product")
      .in("entity_id", ids)
      .in("locale", locales)
      .in("field_name", [...MERCHANT_TRANSLATION_FIELDS])
      .order("id")
      .range(from, to)
  ) : [];
  const byProductLocale = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const key = `${row.entity_id}:${row.locale}`;
    const fields = byProductLocale.get(key) ?? new Map<string, string>();
    fields.set(row.field_name, stripHtml(row.value));
    byProductLocale.set(key, fields);
  }
  for (const product of products) {
    const plainProduct = {
      ...product,
      description: stripHtml(product.description || ""),
      google_description: stripHtml(product.google_description || ""),
    };
    const map = new Map<string, TranslatedFields>();
    map.set(sourceLocale, selectMerchantTranslation(plainProduct, sourceLocale, sourceLocale, new Map())!);
    for (const locale of locales) {
      const fields = selectMerchantTranslation(plainProduct, sourceLocale, locale,
        byProductLocale.get(`${product.id}:${locale}`) ?? new Map());
      if (fields) map.set(locale, fields);
    }
    result.set(product.id, map);
  }

  return result;
}

/**
 * Builds this product's URL for a given locale. Whether the source language
 * gets its own prefix or not is genuinely per-store — confirmed to differ
 * in practice (diecontainers.com/produkt/... has no /de/ prefix even
 * though de is the source language; stfcontainer.com/nl/containers/... DOES
 * keep /nl/ even though nl is the source language) — see
 * stores.source_locale_has_prefix. Never assume either behavior without
 * testing the real live site. The path segment itself (e.g. "products",
 * "containers", "produkt") also varies per store, from
 * stores.product_url_path.
 *
 * localizedSlug is optional and defaults to the product's own (source-
 * language) slug — pass a locale's translated slug (from
 * getTranslationsByLocale) when building a non-source-locale link. Some
 * real storefronts (STF, confirmed live) translate the slug itself per
 * language, not just the surrounding word — without this, every non-source
 * link would point at a URL that only works via a redirect, not the real
 * canonical page, which Google Merchant penalizes.
 *
 * The word itself can also differ per locale (STF again: containers/
 * container/contenedores/conteneurs across nl/de/es/fr) — store.
 * product_url_path_overrides[locale] wins when set, falling back to the
 * single product_url_path word for every locale that doesn't need one.
 *
 * Exported — the XML feed route builds links the exact same way, so a
 * product's link is identical whether it reached Google via API push or
 * via the XML feed.
 */
export function buildProductLink(store: Store, product: Product, locale: string, localizedSlug?: string): string {
  const base = store.domain!.startsWith("http") ? store.domain! : `https://${store.domain}`;
  const trimmedBase = base.replace(/\/$/, "");
  const isSource = locale === store.google_content_language;
  const localePrefix = isSource && !store.source_locale_has_prefix ? "" : `/${locale}`;
  const word = store.product_url_path_overrides?.[locale] || store.product_url_path;
  const path = word.replace(/^\/|\/$/g, "");
  return `${trimmedBase}${localePrefix}${path ? `/${path}` : ""}/${localizedSlug || product.slug}`;
}

export type LinkCheckResult = {
  market: string;
  locale: string;
  url: string;
  status: "ok" | "not_found" | "error";
  httpStatus?: number;
};

async function fetchLinkStatus(url: string): Promise<Omit<LinkCheckResult, "market" | "locale" | "url">> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    // Some storefronts don't implement HEAD (405) -- retry with GET rather
    // than misreporting a perfectly working page as broken.
    if (res.status === 405) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    return { status: res.ok ? "ok" : "not_found", httpStatus: res.status };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Live-checks every market x locale link this store is configured to
 * eventually need — every enabled_locales combination, not just the
 * narrower google_push_locales subset already live on Google — so a broken
 * Product Page Word / Language Prefix setting can be caught in Settings
 * before a language is ever turned on for Google, not just after. Reuses
 * buildProductLink so this tests the exact same URL construction the real
 * sync (API push and XML feed) both rely on.
 */
export async function checkProductLinks(store: Store, product: Product): Promise<LinkCheckResult[]> {
  const markets = store.google_feed_labels?.length ? store.google_feed_labels : [store.google_feed_label];
  const locales = Array.from(new Set([store.google_content_language, ...(store.enabled_locales ?? [])]));
  const textByLocale = await getTranslationsByLocale(store, product);

  const results: LinkCheckResult[] = [];
  for (const market of markets) {
    for (const locale of locales) {
      const slug = textByLocale.get(locale)?.slug;
      const url = buildProductLink(store, product, locale, slug);
      const outcome = await fetchLinkStatus(url);
      results.push({ market, locale, url, ...outcome });
    }
  }
  return results;
}

async function buildProductInput(
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

  const effectiveMpn = resolveProductMpn(product);

  // Google's actual rule: a valid identifier is a GTIN, or brand+MPN
  // together. Brand alone is not sufficient (real-world feeds we compared
  // against use brand+MPN with no GTIN at all, which is what this matches).
  const hasIdentifier = Boolean(product.gtin || (product.brand && effectiveMpn));
  const [marketPrice, marketSalePrice] = await Promise.all([
    convertPriceForMarket(product.price!, product.currency, feedLabel, store),
    product.sale_price
      ? convertPriceForMarket(product.sale_price, product.currency, feedLabel, store)
      : Promise.resolve(null),
  ]);

  return {
    offerId: product.id,
    contentLanguage: locale,
    feedLabel,
    productAttributes: {
      title: text.name,
      description: text.description,
      link: buildProductLink(store, product, locale, text.slug),
      imageLink: product.images[0],
      additionalImageLinks: product.images.slice(1, 10),
      availability: product.status === "active" ? "IN_STOCK" : "OUT_OF_STOCK",
      condition: CONDITION_MAP[product.condition],
      // Ungrouped (family_id null -- every product before this field
      // existed, and every product not explicitly assigned to a family)
      // keeps today's behavior: no itemGroupId, meaning Google treats it as
      // its own group of one. Only products explicitly grouped into a
      // family share a real itemGroupId with their siblings.
      itemGroupId: product.family_id ?? undefined,
      price: {
        amountMicros: String(Math.round(marketPrice.amount * 1_000_000)),
        currencyCode: marketPrice.currency,
      },
      salePrice: marketSalePrice
        ? {
            amountMicros: String(Math.round(marketSalePrice.amount * 1_000_000)),
            currencyCode: marketSalePrice.currency,
          }
        : undefined,
      brand: product.brand ?? undefined,
      gtins: product.gtin ? [product.gtin] : undefined,
      mpn: effectiveMpn ?? undefined,
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
  const combos = getMarketLocaleCombos(store);
  const textByLocale = await getTranslationsByLocale(store, product);

  const results: { market: string; locale: string; name?: string; error?: string }[] = [];

  for (const { market: feedLabel, locale } of combos) {
    try {
      const text = textByLocale.get(locale);
      if (!text) {
        throw new GoogleMerchantValidationError(`Missing ${locale} product title or description translation. Complete the translation before syncing.`);
      }
      const body = await buildProductInput(store, product, locale, feedLabel, text, productType);
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

  const failures = results.filter((r) => r.error);
  if (failures.length > 0) {
    const summary = failures.map((f) => `[${f.locale}/${f.market}] ${f.error}`).join(" | ");
    throw new Error(summary);
  }

  // The source-language listing in the first combo is stored as "the"
  // reference id for display — informational only, not used for sync logic
  // (all combinations are re-submitted as a full upsert every time).
  const primary =
    results.find((r) => r.locale === store.google_content_language) ?? results[0];
  return { name: primary?.name ?? "" };
}

export async function deleteGoogleProduct(store: Store, productId: string) {
  const accountId = getAccountId(store);
  const dataSource = getDataSourceName(store, accountId);
  const client = getAuthClient();
  const combos = getMarketLocaleCombos(store);

  for (const { market: feedLabel, locale } of combos) {
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
