import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildProductLink, getTranslationsByLocaleBatch } from "@/lib/google-merchant";
import { createMarketPriceConverter } from "@/lib/market-pricing";
import type { Product, Store } from "@/lib/types";
import { resolveProductMpn } from "@/lib/product-identifiers";
import { loadMerchantTranslationRows, MerchantTranslationError } from "@/lib/merchant-translations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ERROR_HEADERS = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cdata(str: string): string {
  return `<![CDATA[${str.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

function formatPrice(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(storeId)) {
    return new Response("Invalid store ID.", { status: 400, headers: ERROR_HEADERS });
  }
  try {
    return await generateFeed(request, storeId);
  } catch (error) {
    console.error("Merchant XML feed unavailable", { storeId, message: error instanceof Error ? error.message : "Database error" });
    return new Response(
      error instanceof MerchantTranslationError ? error.message : "Product feed temporarily unavailable. Please retry.",
      { status: 503, headers: { ...ERROR_HEADERS, "Retry-After": "60" } }
    );
  }
}

async function generateFeed(request: Request, storeId: string) {
  const { searchParams } = new URL(request.url);

  const { data: store, error: storeError } = await supabaseAdmin
    .from("stores")
    .select(
      "id, name, domain, google_content_language, enabled_locales, google_push_locales, google_feed_label, google_feed_labels, product_url_path, product_url_path_overrides, source_locale_has_prefix, vat_rates, market_currencies"
    )
    .eq("id", storeId)
    .maybeSingle();
  if (storeError) throw storeError;

  if (!store || !store.domain) {
    return new Response("Store not found or has no domain configured.", {
      status: 404,
      headers: ERROR_HEADERS,
    });
  }

  // No market/locale in the URL = the store's primary market and its own
  // source language — this is the exact single-variant behavior the feed
  // has always had, preserved for any URL already pasted into Merchant
  // Center before multi-market/language support existed.
  const market = (
    searchParams.get("market") ||
    store.google_feed_labels?.[0] ||
    store.google_feed_label
  ).trim().toUpperCase();
  const locale = (searchParams.get("locale") || store.google_content_language).trim().toLowerCase();
  const allowedLocales = new Set([store.google_content_language, ...(store.enabled_locales ?? []), ...(store.google_push_locales ?? [])]
    .map((value: string) => value.trim().toLowerCase()));
  const allowedMarkets = new Set((store.google_feed_labels?.length ? store.google_feed_labels : [store.google_feed_label])
    .map((value: string) => value.trim().toUpperCase()));
  if (!allowedLocales.has(locale) || !allowedMarkets.has(market)) {
    return new Response("This language or delivery market is not configured for the store.", { status: 400, headers: ERROR_HEADERS });
  }

  const products: Product[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "active")
      .not("price", "is", null)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + 499);
    if (error || !data) throw error ?? new Error("Product lookup returned no data.");
    products.push(...data as Product[]);
    if (data.length < 500) break;
  }

  const { data: categories, error: categoryError } = await supabaseAdmin
    .from("categories")
    .select("id, name, parent_id")
    .eq("store_id", storeId);
  if (categoryError) throw categoryError;

  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));
  const categoryNames = new Map<string, string>();
  if (locale === store.google_content_language.trim().toLowerCase()) {
    for (const category of categories ?? []) categoryNames.set(category.id, category.name);
  } else {
    const categoryTranslations = await loadMerchantTranslationRows(
      (categories ?? []).map((category) => category.id),
      async (ids, from, to) => await supabaseAdmin.from("translations")
        .select("entity_id,locale,field_name,value")
        .eq("store_id", storeId).eq("entity_type", "category")
        .eq("locale", locale).eq("field_name", "name")
        .in("entity_id", ids).order("id").range(from, to)
    );
    for (const row of categoryTranslations) {
      if (row.value.trim()) categoryNames.set(row.entity_id, row.value.trim());
    }
  }

  function breadcrumb(categoryId: string | null): string | null {
    if (!categoryId) return null;
    const cat = categoryMap.get(categoryId);
    const name = categoryNames.get(categoryId);
    if (!cat || !name) return null;
    const parentName = cat.parent_id ? categoryNames.get(cat.parent_id) : null;
    return parentName ? `${parentName} > ${name}` : name;
  }

  const storeUrl = store.domain.startsWith("http")
    ? store.domain
    : `https://${store.domain}`;

  const eligibleProducts = (products ?? []).filter((p: Product) => p.images?.length > 0);

  // Batch only this language and share one exchange-rate/VAT lookup. Refuse
  // incomplete reads instead of publishing English or a partial catalogue.
  const translationsByProduct = await getTranslationsByLocaleBatch(store as Store, eligibleProducts, [locale]);
  const missingTranslations = eligibleProducts.filter((product) => !translationsByProduct.get(product.id)?.has(locale));
  if (missingTranslations.length) {
    throw new MerchantTranslationError(`Feed paused: ${missingTranslations.length} product(s) need a ${locale} title or description translation. Complete these translations and retry; source-language content has not been substituted.`);
  }
  const converter = await createMarketPriceConverter(
    market,
    store as Store,
    eligibleProducts.map((p) => p.currency)
  );

  const items = eligibleProducts.map((p: Product) => {
      const textByLocale = translationsByProduct.get(p.id)!;
      const text = textByLocale.get(locale)!;
      const link = buildProductLink(store as Store, p, locale, text.slug);
      const effectiveMpn = resolveProductMpn(p);
      const hasIdentifier = Boolean(p.gtin || (p.brand && effectiveMpn));
      const productType = breadcrumb(p.category_id);
      const additionalImages = (p.images ?? []).slice(1, 10);
      const marketPrice = converter.convert(p.price!, p.currency);
      const marketSalePrice = p.sale_price ? converter.convert(p.sale_price, p.currency) : null;

      return `
  <item>
    <g:id>${escapeXml(p.id)}</g:id>
    <g:title>${cdata(text.name)}</g:title>
    <g:description>${cdata(text.description)}</g:description>
    <g:item_group_id>${escapeXml(p.family_id ?? p.id)}</g:item_group_id>
    <link>${escapeXml(link)}</link>
    ${productType ? `<g:product_type>${cdata(productType)}</g:product_type>` : ""}
    ${p.google_product_category ? `<g:google_product_category>${cdata(p.google_product_category)}</g:google_product_category>` : "<g:google_product_category/>"}
    <g:image_link>${escapeXml(p.images[0])}</g:image_link>
    <g:condition>${p.condition}</g:condition>
    <g:availability>${p.status === "active" ? "in_stock" : "out_of_stock"}</g:availability>
    <g:price>${escapeXml(formatPrice(marketPrice.amount, marketPrice.currency))}</g:price>
    ${marketSalePrice ? `<g:sale_price>${escapeXml(formatPrice(marketSalePrice.amount, marketSalePrice.currency))}</g:sale_price>` : ""}
    ${p.gtin ? `<g:gtin>${escapeXml(p.gtin)}</g:gtin>` : ""}
    ${effectiveMpn ? `<g:mpn>${escapeXml(effectiveMpn)}</g:mpn>` : "<g:mpn/>"}
    ${p.brand ? `<g:brand>${escapeXml(p.brand)}</g:brand>` : ""}
    <g:canonical_link>${escapeXml(link)}</g:canonical_link>
    ${additionalImages.map((img: string) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`).join("\n    ")}
    <g:identifier_exists>${hasIdentifier ? "yes" : "no"}</g:identifier_exists>
  </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" xmlns:c="http://base.google.com/cns/1.0" version="2.0">
<channel>
<title>${cdata(store.name)}</title>
<link>${cdata(storeUrl)}</link>
<language>${escapeXml(locale)}</language>
<description>${cdata(`Product feed for ${store.name} — ${locale} / ${market}`)}</description>
${items.join("")}
</channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Language": locale,
      "Cache-Control": "no-store",
    },
  });
}
