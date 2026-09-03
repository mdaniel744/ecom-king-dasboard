import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createMarketPriceConverter,
  CurrencyConversionError,
} from "@/lib/market-pricing";
import { getStoreMarkets, resolveStorefrontMarket } from "@/lib/merchant-locales";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CustomerAddress, OrderLineItem, Product, Store } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_UUID = STORE_UUID;
const MAX_LINE_ITEMS = 50;
const MAX_QUANTITY_PER_ITEM = 999;

const addressSchema = z
  .object({
    full_name: z.string().trim().max(200).optional(),
    company: z.string().trim().max(200).optional(),
    address_line_1: z.string().trim().max(300).optional(),
    address_line_2: z.string().trim().max(300).optional(),
    city: z.string().trim().max(200).optional(),
    state: z.string().trim().max(200).optional(),
    postal_code: z.string().trim().max(50).optional(),
    country: z.string().trim().max(100).optional(),
  })
  .partial();

const bodySchema = z.object({
  locale: z.string().trim().toLowerCase().max(20).optional(),
  market: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  customerName: z.string().trim().min(1, "Customer name is required").max(200),
  customerEmail: z.string().trim().email("A valid email is required").max(320),
  customerPhone: z.string().trim().max(50).optional(),
  billingAddress: addressSchema.optional(),
  deliveryAddress: addressSchema.optional(),
  customerNote: z.string().trim().max(2000).optional(),
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
      })
    )
    .min(1, "At least one line item is required")
    .max(MAX_LINE_ITEMS, `A single order can contain at most ${MAX_LINE_ITEMS} line items`),
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

type CheckoutProduct = Pick<
  Product,
  "id" | "name" | "price" | "currency" | "images" | "condition" | "brand" | "status" | "store_id"
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
 * /api/storefront/prices in every trust decision: the client sends only
 * product ids + quantities, never a price -- every amount here is
 * recomputed server-side from the same live product/market/VAT data the
 * pricing endpoint itself uses, so a tampered client request can't produce
 * a wrong total. The two DB triggers already wired to checkout_orders
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
      "id, slug, google_content_language, enabled_locales, google_feed_label, google_feed_labels, market_currencies, locale_markets, vat_rates"
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
  const market =
    parsed.data.market ||
    (parsed.data.locale ? resolveStorefrontMarket(store, parsed.data.locale) : configuredMarkets[0]);
  if (!market) {
    console.error(
      `Storefront checkout rejected [${storeId}]: no market resolvable from locale "${parsed.data.locale}"`
    );
    return json(
      {
        error:
          `No delivery market is linked to storefront locale "${parsed.data.locale}". ` +
          "Link it under Delivery Markets or send an explicit market code.",
      },
      { status: 422 }
    );
  }

  const productIds = Array.from(new Set(parsed.data.lineItems.map((item) => item.productId)));
  const { data: productData, error: productError } = await supabaseAdmin
    .from("products")
    .select("id, name, price, currency, images, condition, brand, status, store_id")
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
      const converted = converter.convert(product.price!, product.currency);
      return {
        product_id: product.id,
        title: product.name,
        price: converted.netAmount,
        currency: converter.currency,
        image: product.images?.[0] ?? null,
        quantity: item.quantity,
        condition: product.condition,
        brand: product.brand ?? undefined,
      };
    });

    const subtotal = Math.round(
      lineItems.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100
    ) / 100;
    const taxAmount = Math.round(subtotal * (converter.vatRate / 100) * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

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
        line_items: lineItems,
        billing_address: (parsed.data.billingAddress as CustomerAddress) || null,
        delivery_address: (parsed.data.deliveryAddress as CustomerAddress) || null,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: converter.currency,
        payment_method: "bank_transfer",
        customer_note: parsed.data.customerNote || null,
      })
      .select("id, order_number, currency, subtotal, tax_amount, total_amount, order_status, payment_status")
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
          taxAmount: order.tax_amount,
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
