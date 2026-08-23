import "server-only";
import { JWT } from "google-auth-library";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Product, ProductCondition, Store } from "@/lib/types";
import { checkProductForMerchant, hasBlockingIssues } from "@/lib/merchant-rules";
import { stripHtml } from "@/lib/html";

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
 * A store's delivery markets (Google feed labels) and the locales actually
 * submitted to Google, combined into every market x locale pair a product
 * must be individually submitted to. Source language is always included.
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
 */
function getMarketsAndLocales(store: Store): { markets: string[]; locales: string[] } {
  const markets =
    store.google_feed_labels && store.google_feed_labels.length > 0
      ? store.google_feed_labels
      : [store.google_feed_label];

  const sourceLocale = store.google_content_language || "en";
  const pushLocales = store.google_push_locales ?? [];
  const locales = Array.from(new Set([sourceLocale, ...pushLocales]));

  return { markets, locales };
}

export type TranslatedFields = { name: string; description: string; short_description: string | null; slug: string };

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
  // google_title/google_description, when set, are what actually gets sent
  // to Google — a store can write different copy for Google's algorithm
  // than what a human visitor sees. Falls back to name/description when
  // unset, which is every product on every store before this field existed.
  const titleFieldName = product.google_title ? "google_title" : "name";
  const descriptionFieldName = product.google_description ? "google_description" : "description";

  const sourceFields: TranslatedFields = {
    name: product.google_title || product.name,
    // description is rich-text HTML (see product-form.tsx's RichTextEditor)
    // — Google's spec wants plain text, so it's always stripped here
    // regardless of source. stripHtml is a no-op on already-plain text
    // (e.g. google_description overrides), so this is safe either way.
    description: stripHtml(product.google_description || product.description || product.name),
    short_description: product.short_description,
    slug: product.slug,
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
    if (row.field_name === titleFieldName) entry.name = row.value;
    if (row.field_name === descriptionFieldName) entry.description = stripHtml(row.value);
    if (row.field_name === "short_description") entry.short_description = row.value;
    if (row.field_name === "slug") entry.slug = row.value;
  }

  return map;
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
  return `${trimmedBase}${localePrefix}/${path}/${localizedSlug || product.slug}`;
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

/**
 * Product prices are always stored VAT-exclusive (net) -- see
 * stores.vat_rates doc comment. Adds this market's configured VAT rate, if
 * any, and rounds to 2 decimal places before the caller converts to micros,
 * so the submitted price is a clean currency amount rather than carrying
 * floating-point remainder digits. A market with no rate configured returns
 * the price unchanged (opt-in, not a platform default).
 */
export function applyVat(price: number, market: string, store: Store): number {
  const rate = store.vat_rates?.[market];
  if (!rate) return price;
  return Math.round(price * (1 + rate / 100) * 100) / 100;
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
      link: buildProductLink(store, product, locale, text.slug),
      imageLink: product.images[0],
      additionalImageLinks: product.images.slice(1, 10),
      availability: product.status === "active" ? "IN_STOCK" : "OUT_OF_STOCK",
      condition: CONDITION_MAP[product.condition],
      price: {
        amountMicros: String(Math.round(applyVat(product.price!, feedLabel, store) * 1_000_000)),
        currencyCode: product.currency,
      },
      salePrice: product.sale_price
        ? {
            amountMicros: String(Math.round(applyVat(product.sale_price, feedLabel, store) * 1_000_000)),
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
