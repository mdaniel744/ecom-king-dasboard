import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  asCustomerAddress,
  asFormFieldData,
  buildStorefrontProductUrl,
  customerAddressSchema,
  formFieldDataSchema,
} from "@/lib/storefront-submissions";
import type { InquiryProductSnapshot, Product, Store } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && !value.trim() ? undefined : value;

const bodySchema = z
  .object({
    locale: z.string().trim().toLowerCase().max(20).optional(),
    customerName: z.string().trim().max(200).optional(),
    customerEmail: z.preprocess(
      emptyToUndefined,
      z.string().trim().email("Enter a valid email").max(320).optional()
    ),
    customerPhone: z.string().trim().max(50).optional(),
    customerCompany: z.string().trim().max(200).optional(),
    customerDetails: formFieldDataSchema.optional(),
    billingAddress: customerAddressSchema.nullish(),
    deliveryAddress: customerAddressSchema.nullish(),
    productId: z.preprocess(
      emptyToUndefined,
      z.string().regex(STORE_UUID, "Invalid product id").optional()
    ),
    productName: z.string().trim().max(500).optional(),
    productType: z.string().trim().max(300).optional(),
    productUrl: z.preprocess(
      emptyToUndefined,
      z.string().trim().url().max(2000).optional()
    ),
    productImage: z.preprocess(
      emptyToUndefined,
      z.string().trim().url().max(2000).optional()
    ),
    listedPrice: z.number().finite().min(0).max(1_000_000_000_000).optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
    quantity: z.number().int().min(1).max(100_000).optional(),
    productConfiguration: formFieldDataSchema.optional(),
    formFields: formFieldDataSchema.optional(),
    message: z.string().trim().max(10_000).optional(),
  })
  .refine((value) => value.customerEmail || value.customerPhone, {
    message: "An email address or phone number is required",
    path: ["customerEmail"],
  })
  .refine((value) => value.productId || value.productName || value.productUrl, {
    message: "Product information is required",
    path: ["productId"],
  });

type InquiryStore = Pick<
  Store,
  | "id"
  | "domain"
  | "google_content_language"
  | "enabled_locales"
  | "product_url_path"
  | "product_url_path_overrides"
  | "source_locale_has_prefix"
>;

type InquiryProduct = Pick<
  Product,
  | "id"
  | "store_id"
  | "category_id"
  | "name"
  | "slug"
  | "sku"
  | "price"
  | "currency"
  | "images"
  | "attributes"
  | "status"
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json(
      { error: "Invalid inquiry request", details: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const clientAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`storefront-inquiry:${clientAddress}:${storeId}`, 20, 60_000)) {
    return json(
      { error: "Too many inquiry attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let storeQuery = supabaseAdmin
    .from("stores")
    .select(
      "id, domain, google_content_language, enabled_locales, product_url_path, product_url_path_overrides, source_locale_has_prefix"
    );
  storeQuery = STORE_UUID.test(storeId)
    ? storeQuery.eq("id", storeId)
    : storeQuery.eq("slug", storeId);

  const { data: storeData, error: storeError } = await storeQuery.maybeSingle();
  if (storeError || !storeData) return json({ error: "Store not found" }, { status: 404 });
  const store = storeData as InquiryStore;

  let product: InquiryProduct | null = null;
  let categoryName: string | null = null;
  if (parsed.data.productId) {
    const { data: productData, error: productError } = await supabaseAdmin
      .from("products")
      .select(
        "id, store_id, category_id, name, slug, sku, price, currency, images, attributes, status"
      )
      .eq("id", parsed.data.productId)
      .eq("store_id", store.id)
      .maybeSingle();

    if (productError || !productData) {
      return json({ error: "The selected product could not be found." }, { status: 404 });
    }
    product = productData as InquiryProduct;

    if (product.category_id) {
      const { data: category } = await supabaseAdmin
        .from("categories")
        .select("name")
        .eq("id", product.category_id)
        .eq("store_id", store.id)
        .maybeSingle();
      categoryName = category?.name ?? null;
    }
  }

  const customerDetails = asFormFieldData(parsed.data.customerDetails);
  const billingAddress = asCustomerAddress(parsed.data.billingAddress);
  const deliveryAddress = asCustomerAddress(parsed.data.deliveryAddress);
  const configuration = {
    ...(product?.attributes ?? {}),
    ...asFormFieldData(parsed.data.productConfiguration),
  };
  const productSnapshot: InquiryProductSnapshot = {
    product_id: product?.id ?? null,
    name: product?.name || parsed.data.productName || "Product inquiry",
    type: parsed.data.productType || categoryName,
    sku: product?.sku ?? null,
    url:
      (product ? buildStorefrontProductUrl(store, product, parsed.data.locale) : null) ||
      parsed.data.productUrl ||
      null,
    image: product?.images?.[0] || parsed.data.productImage || null,
    listed_price: product?.price ?? parsed.data.listedPrice ?? null,
    currency: product?.currency ?? parsed.data.currency ?? null,
    attributes: configuration,
  };
  const formData = asFormFieldData(parsed.data.formFields);

  const { data: inquiry, error: insertError } = await supabaseAdmin
    .from("inquiries")
    .insert({
      store_id: store.id,
      product_id: product?.id ?? null,
      customer_name: parsed.data.customerName || null,
      customer_email: parsed.data.customerEmail || null,
      customer_phone: parsed.data.customerPhone || null,
      customer_company: parsed.data.customerCompany || null,
      customer_details: customerDetails,
      customer_address: billingAddress || deliveryAddress,
      billing_address: billingAddress,
      delivery_address: deliveryAddress,
      product_url: productSnapshot.url,
      product_snapshot: productSnapshot,
      requested_quantity: parsed.data.quantity ?? null,
      form_data: formData,
      message: parsed.data.message || null,
      details: {
        customer: {
          ...customerDetails,
          name: parsed.data.customerName || null,
          email: parsed.data.customerEmail || null,
          phone: parsed.data.customerPhone || null,
          company: parsed.data.customerCompany || null,
        },
        product: productSnapshot,
        configuration,
        billing_address: billingAddress,
        delivery_address: deliveryAddress,
        form_fields: formData,
      },
    })
    .select("id, inquiry_number, status")
    .single();

  if (insertError || !inquiry) {
    console.error("Storefront inquiry creation failed:", insertError);
    return json({ error: "The inquiry could not be submitted. Please try again." }, { status: 500 });
  }

  return json(
    {
      inquiry: {
        id: inquiry.id,
        inquiryNumber: inquiry.inquiry_number,
        status: inquiry.status,
      },
    },
    { status: 201 }
  );
}
