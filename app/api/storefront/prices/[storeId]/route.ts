import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createMarketPriceConverter,
  CurrencyConversionError,
} from "@/lib/market-pricing";
import {
  defaultCurrencyForMarket,
  getStoreMarkets,
  resolveStorefrontMarket,
} from "@/lib/merchant-locales";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Product, Store } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_UUID = STORE_UUID;

const querySchema = z.object({
  locale: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2,3}(?:-[a-z0-9]+)*$/)
    .optional(),
  market: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  productIds: z.array(z.string().regex(PRODUCT_UUID)).max(100).optional(),
  slugs: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
});

type PricingStore = Pick<
  Store,
  | "id"
  | "slug"
  | "google_content_language"
  | "enabled_locales"
  | "google_feed_label"
  | "google_feed_labels"
  | "market_currencies"
  | "locale_markets"
  | "vat_rates"
>;

type PriceProduct = Pick<
  Product,
  "id" | "slug" | "price" | "sale_price" | "currency" | "updated_at"
>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
  return NextResponse.json(data, { ...init, headers });
}

function listParam(value: string | null): string[] | undefined {
  if (!value) return undefined;
  return Array.from(
    new Set(value.split(",").map((item) => item.trim()).filter(Boolean))
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;
  const parsed = querySchema.safeParse({
    locale: request.nextUrl.searchParams.get("locale") || undefined,
    market: request.nextUrl.searchParams.get("market") || undefined,
    page: request.nextUrl.searchParams.get("page") || undefined,
    limit: request.nextUrl.searchParams.get("limit") || undefined,
    productIds: listParam(request.nextUrl.searchParams.get("productIds")),
    slugs: listParam(request.nextUrl.searchParams.get("slugs")),
  });

  if (!parsed.success) {
    return json(
      { error: "Invalid pricing request", details: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`storefront-prices:${clientAddress}:${storeId}`, 120, 60_000)) {
    return json(
      { error: "Too many pricing requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let storeQuery = supabaseAdmin
    .from("stores")
    .select(
      "id, slug, google_content_language, enabled_locales, google_feed_label, google_feed_labels, market_currencies, locale_markets, vat_rates"
    );
  storeQuery = STORE_UUID.test(storeId)
    ? storeQuery.eq("id", storeId)
    : storeQuery.eq("slug", storeId);

  const { data: storeData, error: storeError } = await storeQuery.maybeSingle();
  if (storeError || !storeData) {
    return json({ error: "Store not found" }, { status: 404 });
  }

  const store = storeData as PricingStore;
  const configuredMarkets = getStoreMarkets(store);
  const acceptedCurrencies = Array.from(
    new Set(
      configuredMarkets.map(
        (configuredMarket) =>
          (
            store.market_currencies?.[configuredMarket] ??
            defaultCurrencyForMarket(configuredMarket)
          ).toUpperCase()
      )
    )
  );
  const availableLocales = new Set([
    store.google_content_language.toLowerCase(),
    ...(store.enabled_locales ?? []).map((locale) => locale.toLowerCase()),
  ]);
  const requestedLocale = parsed.data.locale;
  const baseLocale = requestedLocale?.split("-")[0];

  if (
    requestedLocale &&
    !availableLocales.has(requestedLocale) &&
    (!baseLocale || !availableLocales.has(baseLocale))
  ) {
    return json(
      { error: `The storefront locale "${requestedLocale}" is not enabled for this store.` },
      { status: 400 }
    );
  }

  if (parsed.data.market && !configuredMarkets.includes(parsed.data.market)) {
    return json(
      { error: `The delivery market "${parsed.data.market}" is not enabled for this store.` },
      { status: 400 }
    );
  }

  const market =
    parsed.data.market ||
    (requestedLocale ? resolveStorefrontMarket(store, requestedLocale) : configuredMarkets[0]);
  if (!market) {
    return json(
      {
        error:
          `No delivery market is linked to storefront locale "${requestedLocale}". ` +
          "Link it under Delivery Markets or send an explicit market code.",
      },
      { status: 422 }
    );
  }

  let productQuery = supabaseAdmin
    .from("products")
    .select("id, slug, price, sale_price, currency, updated_at")
    .eq("store_id", store.id)
    .eq("status", "active")
    .not("price", "is", null);

  const filteredByIdentity = Boolean(parsed.data.productIds?.length || parsed.data.slugs?.length);
  if (parsed.data.productIds?.length) {
    productQuery = productQuery.in("id", parsed.data.productIds);
  } else if (parsed.data.slugs?.length) {
    productQuery = productQuery.in("slug", parsed.data.slugs);
  } else {
    const from = (parsed.data.page - 1) * parsed.data.limit;
    productQuery = productQuery
      .order("created_at", { ascending: false })
      .range(from, from + parsed.data.limit);
  }

  const { data: productData, error: productError } = await productQuery;
  if (productError) {
    console.error("Storefront pricing product query failed:", productError);
    return json({ error: "Product prices could not be loaded" }, { status: 500 });
  }

  const fetchedProducts = (productData ?? []) as PriceProduct[];
  const hasMore = !filteredByIdentity && fetchedProducts.length > parsed.data.limit;
  const products = hasMore
    ? fetchedProducts.slice(0, parsed.data.limit)
    : fetchedProducts;

  try {
    const converter = await createMarketPriceConverter(
      market,
      store,
      products.map((product) => product.currency)
    );

    const convertedProducts = products.map((product) => {
      const regular = converter.convert(product.price!, product.currency);
      const sale =
        product.sale_price != null
          ? converter.convert(product.sale_price, product.currency)
          : null;

      return {
        id: product.id,
        slug: product.slug,
        updatedAt: product.updated_at,
        sourcePrice: {
          price: product.price,
          salePrice: product.sale_price,
          currency: product.currency,
        },
        marketPrice: {
          price: regular.amount,
          salePrice: sale?.amount ?? null,
          netPrice: regular.netAmount,
          netSalePrice: sale?.netAmount ?? null,
          currency: regular.currency,
          vatRate: regular.vatRate,
          includesVat: regular.vatRate > 0,
          exchangeRate: regular.exchangeRate,
          rateDate: regular.rateDate,
          rateSource: regular.rateSource,
        },
      };
    });

    return json(
      {
        store: { id: store.id, slug: store.slug },
        selection: {
          locale: requestedLocale ?? null,
          market,
          currency: converter.currency,
          vatRate: converter.vatRate,
          multiCurrencyEnabled: acceptedCurrencies.length > 1,
          acceptedCurrencies,
        },
        pagination: {
          page: parsed.data.page,
          limit: parsed.data.limit,
          hasMore,
        },
        products: convertedProducts,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error) {
    if (error instanceof CurrencyConversionError) {
      return json({ error: error.message }, { status: 422 });
    }
    console.error("Storefront market pricing failed:", error);
    return json({ error: "Market prices could not be calculated" }, { status: 500 });
  }
}
