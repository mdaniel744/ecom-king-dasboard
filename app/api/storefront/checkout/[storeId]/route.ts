import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createMarketPriceConverter,
  CurrencyConversionError,
} from "@/lib/market-pricing";
import { getStoreMarkets, resolveRequestedStorefrontMarket } from "@/lib/merchant-locales";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  asCustomerAddress,
  asFormFieldData,
  buildStorefrontProductUrl,
  customerAddressSchema,
  formFieldDataSchema,
} from "@/lib/storefront-submissions";
import type { OrderLineItem, Product, Store } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_UUID = STORE_UUID;
const MAX_LINE_ITEMS = 50;
const MAX_QUANTITY_PER_ITEM = 999;
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && !value.trim() ? undefined : value;

const bodySchema = z.object({
  locale: z.string().trim().toLowerCase().max(20).optional(),
  market: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  customerName: z.string().trim().min(1, "Customer name is required").max(200),
  customerEmail: z.string().trim().email("A valid email is required").max(320),
  customerPhone: z.string().trim().max(50).optional(),
  billingAddress: customerAddressSchema.nullish(),
  deliveryAddress: customerAddressSchema.nullish(),
  customerDetails: formFieldDataSchema.optional(),
  formFields: formFieldDataSchema.optional(),
  customerNote: z.string().trim().max(2000).optional(),
  shippingAmount: z.number().finite().min(0).max(1_000_000_000).optional(),
  deliveryMethod: z.string().trim().max(200).optional(),
  // Optional -- lets a storefront's own client-generated order reference (e.g.
  // "DC-20260902-0007") become the actual order_number shown in the
  // dashboard, instead of our auto-generated default, so what the customer
  // sees on their confirmation page matches what staff see here. Omit to
  // fall back to the database's own ORD-YYYYMMDD-NNNNN sequence.
  clientReference: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, "Reference may only contain letters, numbers, dots, hyphens, underscores")
    .optional(),
  lineItems: z
    .array(
      z.object({
        productId: z.string().regex(PRODUCT_UUID, "Invalid product id"),
        quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_ITEM),
        productUrl: z.preprocess(
          emptyToUndefined,
          z.string().trim().url().max(2000).optional()
        ),
        configuration: formFieldDataSchema.optional(),
      })
    )
    .min(1, "At least one line item is required")
    .max(MAX_LINE_ITEMS, `A single order can contain at most ${MAX_LINE_ITEMS} line items`),
});

type PricingStore = Pick<
  Store,
  | "id"
  | "slug"
  | "domain"
  | "google_content_language"
  | "enabled_locales"
  | "google_feed_label"
  | "google_feed_labels"
  | "market_currencies"
  | "locale_markets"
  | "vat_rates"
  | "product_url_path"
  | "product_url_path_overrides"
  | "source_locale_has_prefix"
>;

type CheckoutProduct = Pick<
  Product,
  | "id"
  | "name"
  | "slug"
  | "price"
  | "sale_price"
  | "currency"
  | "images"
  | "condition"
  | "brand"
  | "sku"
  | "attributes"
  | "status"
  | "store_id"
>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
  return NextResponse.json(data, { ...init, headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Creates a real checkout_orders row from a storefront's cart. Mirrors
 * /api/storefront/prices for product-price trust: the client never sends
 * product prices -- every product amount and VAT value is recomputed from
 * live product/market data. Delivery charges must also come from a trusted
 * server integration; this public endpoint refuses browser-calculated
 * delivery amounts. The two DB triggers wired to checkout_orders
 * (auto-invoice email, staff submission notification) fire automatically
 * on insert -- this route only needs to create a correct, trustworthy row.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    console.error(
      `Storefront checkout rejected [${storeId}]: invalid request`,
      z.flattenError(parsed.error).fieldErrors
    );
    return json(
      { error: "Invalid checkout request", details: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`storefront-checkout:${clientAddress}:${storeId}`, 20, 60_000)) {
    console.error(`Storefront checkout rejected [${storeId}]: rate limited (${clientAddress})`);
    return json(
      { error: "Too many checkout attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let storeQuery = supabaseAdmin
    .from("stores")
    .select(
      "id, slug, domain, google_content_language, enabled_locales, google_feed_label, google_feed_labels, market_currencies, locale_markets, vat_rates, product_url_path, product_url_path_overrides, source_locale_has_prefix"
    );
  storeQuery = STORE_UUID.test(storeId)
    ? storeQuery.eq("id", storeId)
    : storeQuery.eq("slug", storeId);

  const { data: storeData, error: storeError } = await storeQuery.maybeSingle();
  if (storeError || !storeData) {
    console.error(`Storefront checkout rejected [${storeId}]: store not found`, storeError);
    return json({ error: "Store not found" }, { status: 404 });
  }
  const store = storeData as PricingStore;

  const configuredMarkets = getStoreMarkets(store);
  if (parsed.data.market && !configuredMarkets.includes(parsed.data.market)) {
    console.error(
      `Storefront checkout rejected [${storeId}]: market "${parsed.data.market}" not enabled (configured: ${configuredMarkets.join(", ")})`
    );
    return json(
      { error: `The delivery market "${parsed.data.market}" is not enabled for this store.` },
      { status: 400 }
    );
  }
  const market = resolveRequestedStorefrontMarket(
    store,
    parsed.data.locale,
    parsed.data.market
  );
  if (!market) {
    console.error(
      `Storefront checkout rejected [${storeId}]: no market resolvable from locale "${parsed.data.locale}"`
    );
    return json(
      {
        error:
          `The storefront locale/market selection is not enabled for this store. ` +
          "For Kariv, Czech uses CZ/CZK while English and German use DE/EUR.",
      },
      { status: 422 }
    );
  }

  // This public route cannot trust a delivery charge calculated in a browser.
  // Until server-managed delivery rules are connected, accept only free/zero
  // delivery here. Kariv's deployed server checkout may continue writing its
  // own trusted final order snapshot directly.
  if ((parsed.data.shippingAmount ?? 0) !== 0) {
    return json(
      {
        error:
          "A browser-supplied delivery charge cannot be used as an authoritative order amount. " +
          "Calculate delivery on the storefront server or configure server-side delivery rules.",
      },
      { status: 422 }
    );
  }

  const productIds = Array.from(new Set(parsed.data.lineItems.map((item) => item.productId)));
  const { data: productData, error: productError } = await supabaseAdmin
    .from("products")
    .select("id, name, slug, price, sale_price, currency, images, condition, brand, sku, attributes, status, store_id")
    .eq("store_id", store.id)
    .in("id", productIds);

  if (productError) {
    console.error("Storefront checkout product lookup failed:", productError);
    return json({ error: "Products could not be verified." }, { status: 500 });
  }

  const productsById = new Map(
    ((productData ?? []) as CheckoutProduct[]).map((product) => [product.id, product])
  );
  const missingOrInactive = productIds.filter((id) => {
    const product = productsById.get(id);
    return !product || product.status !== "active" || product.price == null;
  });
  if (missingOrInactive.length > 0) {
    console.error(
      `Storefront checkout rejected [${storeId}]: unavailable products ${missingOrInactive.join(", ")}`
    );
    return json(
      {
        error: "Some items in your cart are no longer available.",
        unavailableProductIds: missingOrInactive,
      },
      { status: 409 }
    );
  }

  try {
    const converter = await createMarketPriceConverter(
      market,
      store,
      parsed.data.lineItems.map((item) => productsById.get(item.productId)!.currency)
    );

    const lineItems: OrderLineItem[] = parsed.data.lineItems.map((item) => {
      const product = productsById.get(item.productId)!;
      const sourcePrice = product.sale_price ?? product.price!;
      const converted = converter.convert(sourcePrice, product.currency);
      const lineSubtotal = Math.round(converted.netAmount * item.quantity * 100) / 100;
      const lineTaxAmount = Math.round(lineSubtotal * (converter.vatRate / 100) * 100) / 100;
      return {
        product_id: product.id,
        title: product.name,
        price: converted.netAmount,
        currency: converter.currency,
        image: product.images?.[0] ?? null,
        quantity: item.quantity,
        product_url:
          buildStorefrontProductUrl(store, product, parsed.data.locale) || item.productUrl || null,
        sku: product.sku,
        attributes: {
          ...(product.attributes ?? {}),
          ...asFormFieldData(item.configuration),
        },
        line_subtotal: lineSubtotal,
        line_tax_amount: lineTaxAmount,
        line_total: Math.round((lineSubtotal + lineTaxAmount) * 100) / 100,
        condition: product.condition,
        brand: product.brand ?? undefined,
        source_price: sourcePrice,
        source_currency: product.currency,
        exchange_rate: converted.exchangeRate,
        rate_date: converted.rateDate,
        rate_source: converted.rateSource,
      };
    });

    const subtotal = Math.round(
      lineItems.reduce(
        (sum, item) => sum + (item.line_subtotal ?? item.price * item.quantity),
        0
      ) * 100
    ) / 100;
    const taxAmount = Math.round(
      lineItems.reduce((sum, item) => sum + (item.line_tax_amount ?? 0), 0) * 100
    ) / 100;
    const shippingAmount = Math.round((parsed.data.shippingAmount ?? 0) * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount + shippingAmount) * 100) / 100;

    const { data: order, error: insertError } = await supabaseAdmin
      .from("checkout_orders")
      .insert({
        store_id: store.id,
        // Omitted entirely (not even as null) when not sent, so the
        // database's own ORD-YYYYMMDD-NNNNN default still applies --
        // explicitly passing null would satisfy the nullable column but
        // skip the default expression instead of triggering it.
        ...(parsed.data.clientReference ? { order_number: parsed.data.clientReference } : {}),
        customer_name: parsed.data.customerName,
        customer_email: parsed.data.customerEmail,
        customer_phone: parsed.data.customerPhone || null,
        customer_details: asFormFieldData(parsed.data.customerDetails),
        line_items: lineItems,
        billing_address: asCustomerAddress(parsed.data.billingAddress),
        delivery_address: asCustomerAddress(parsed.data.deliveryAddress),
        subtotal,
        discount_amount: 0,
        shipping_amount: shippingAmount,
        tax_amount: taxAmount,
        tax_rate: converter.vatRate,
        total_amount: totalAmount,
        currency: converter.currency,
        market,
        locale: parsed.data.locale || null,
        delivery_method: parsed.data.deliveryMethod || null,
        form_data: {
          ...asFormFieldData(parsed.data.formFields),
          pricing_audit: {
            calculated_by: "dashboard_server",
            calculated_at: new Date().toISOString(),
            market,
            locale: parsed.data.locale || store.google_content_language,
            order_currency: converter.currency,
            rate_sources: Array.from(
              new Set(lineItems.map((item) => item.rate_source).filter(Boolean))
            ),
            rate_dates: Array.from(
              new Set(lineItems.map((item) => item.rate_date).filter(Boolean))
            ),
          },
        },
        payment_method: "bank_transfer",
        customer_note: parsed.data.customerNote || null,
      })
      .select("id, order_number, currency, subtotal, shipping_amount, tax_amount, tax_rate, total_amount, order_status, payment_status")
      .single();

    if (insertError?.code === "23505") {
      console.error(
        `Storefront checkout rejected [${storeId}]: duplicate clientReference "${parsed.data.clientReference}"`
      );
      return json(
        { error: `An order with reference "${parsed.data.clientReference}" already exists.` },
        { status: 409 }
      );
    }
    if (insertError || !order) {
      console.error("Checkout order creation failed:", insertError);
      return json({ error: "The order could not be created. Please try again." }, { status: 500 });
    }

    return json(
      {
        order: {
          id: order.id,
          orderNumber: order.order_number,
          currency: order.currency,
          subtotal: order.subtotal,
          shippingAmount: order.shipping_amount,
          taxAmount: order.tax_amount,
          taxRate: order.tax_rate,
          totalAmount: order.total_amount,
          orderStatus: order.order_status,
          paymentStatus: order.payment_status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof CurrencyConversionError) {
      console.error(`Storefront checkout rejected [${storeId}]: currency conversion — ${error.message}`);
      return json({ error: error.message }, { status: 422 });
    }
    console.error("Storefront checkout failed:", error);
    return json({ error: "The order could not be created." }, { status: 500 });
  }
}
