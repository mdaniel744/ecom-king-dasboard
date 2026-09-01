import "server-only";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Attribute,
  AttributeValue,
  Brand,
  Category,
  Collection,
  CheckoutOrder,
  DealerApplication,
  Inquiry,
  Order,
  OrderMessage,
  Product,
  ProductFamily,
  Store,
} from "@/lib/types";

export const isLocalDemoMode = process.env.LOCAL_DEMO_MODE === "true";

const now = "2026-01-01T00:00:00.000Z";

export const localDemoStore: Store = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Ecom King Demo",
  slug: "ecom-king-demo",
  domain: null,
  owner_user_id: "demo_owner",
  google_merchant_id: null,
  google_merchant_datasource_id: null,
  google_content_language: "en",
  google_feed_label: "US",
  google_feed_labels: ["US"],
  product_url_path: "products",
  product_url_path_overrides: {},
  source_locale_has_prefix: false,
  enabled_locales: [],
  google_push_locales: [],
  vat_rates: {},
  notification_email: null,
  notification_sender_name: null,
  notify_inquiries: true,
  notify_checkout_orders: true,
  notify_escrow_orders: true,
  created_at: now,
  updated_at: now,
};

const demoCategory: Category = {
  id: "00000000-0000-4000-8000-000000000101",
  store_id: localDemoStore.id,
  parent_id: null,
  name: "Apparel",
  slug: "apparel",
  image_url: null,
  description: "Demo apparel products",
  is_featured: true,
  display_order: 1,
  meta_title: null,
  meta_description: null,
  created_at: now,
};

const demoBrand: Brand = {
  id: "00000000-0000-4000-8000-000000000151",
  store_id: localDemoStore.id,
  name: "Ecom King Basics",
  slug: "ecom-king-basics",
  short_description: "A sample brand for local product-form previews.",
  long_description: null,
  disclaimer: null,
  meta_title: "Ecom King Basics",
  meta_description: "Everyday products from the Ecom King Basics collection.",
  logo_light_url: null,
  logo_dark_url: null,
  hero_image_url: null,
  created_at: now,
  updated_at: now,
};

const demoCollection: Collection = {
  id: "00000000-0000-4000-8000-000000000161",
  store_id: localDemoStore.id,
  brand_id: demoBrand.id,
  name: "Everyday Essentials",
  slug: "everyday-essentials",
  description: "A sample collection for local product-form previews.",
  image_url: null,
  created_at: now,
  updated_at: now,
};

const demoAttributes: Attribute[] = [
  {
    id: "00000000-0000-4000-8000-000000000201",
    store_id: localDemoStore.id,
    name: "Size",
    created_at: now,
  },
  {
    id: "00000000-0000-4000-8000-000000000202",
    store_id: localDemoStore.id,
    name: "Colour",
    created_at: now,
  },
];

const demoAttributeValues: AttributeValue[] = [
  ["00000000-0000-4000-8000-000000000211", demoAttributes[0].id, "Small"],
  ["00000000-0000-4000-8000-000000000212", demoAttributes[0].id, "Medium"],
  ["00000000-0000-4000-8000-000000000213", demoAttributes[0].id, "Large"],
  ["00000000-0000-4000-8000-000000000214", demoAttributes[1].id, "Black"],
  ["00000000-0000-4000-8000-000000000215", demoAttributes[1].id, "White"],
  ["00000000-0000-4000-8000-000000000216", demoAttributes[1].id, "Navy"],
].map(([id, attributeId, value]) => ({
  id,
  attribute_id: attributeId,
  value,
  label: null,
  image_url: null,
  description: null,
  created_at: now,
}));

const demoProductFamily: ProductFamily = {
  id: "00000000-0000-4000-8000-000000000301",
  store_id: localDemoStore.id,
  category_id: demoCategory.id,
  name: "Classic Hoodie",
  slug: "classic-hoodie",
  description:
    "A demonstration variable product. Shoppers see one hoodie page and can switch between size and colour variations.",
  short_description: "One product family with nine independently managed hoodie variations.",
  images: ["/icons/icon-512.png"],
  is_featured: true,
  status: "active",
  created_at: now,
  updated_at: now,
};

const demoSizes = ["Small", "Medium", "Large"];
const demoColours = ["Black", "White", "Navy"];
const demoDealerUserId = "user_demo_dealer";

const demoProducts: Product[] = demoSizes.flatMap((size, sizeIndex) =>
  demoColours.map((colour, colourIndex) => {
    const index = sizeIndex * demoColours.length + colourIndex + 1;
    const complete = index <= 3;
    const slug = `classic-hoodie-${size.toLowerCase()}-${colour.toLowerCase()}`;

    return {
      id: `00000000-0000-4000-8000-${String(400 + index).padStart(12, "0")}`,
      store_id: localDemoStore.id,
      category_id: demoCategory.id,
      name: `Classic Hoodie — ${size}, ${colour}`,
      slug,
      short_description: complete ? `Classic hoodie in ${size}, ${colour}.` : null,
      description: complete ? `<p>Complete demo product details for the ${size}, ${colour} hoodie.</p>` : null,
      meta_title: complete ? `Classic ${colour} Hoodie in ${size}` : null,
      meta_description: complete
        ? `Shop the Classic Hoodie in ${colour}, size ${size}, with comfortable everyday styling.`
        : null,
      price: complete ? 59 + colourIndex * 5 : null,
      sale_price: null,
      currency: "USD",
      sku: complete ? `HD-${size.slice(0, 1).toUpperCase()}-${colour.slice(0, 2).toUpperCase()}` : null,
      stock_quantity: complete ? 12 + index : 0,
      status: complete ? "active" : "draft",
      images: complete ? ["/icons/icon-512.png"] : [],
      image_titles: complete ? [`Classic Hoodie ${colour} ${size}`] : [],
      image_alts: complete ? [`Classic Hoodie in ${colour}, size ${size}`] : [],
      image_descriptions: complete
        ? [`Product photo of the Classic Hoodie in ${colour}, size ${size}.`]
        : [],
      attributes: { Size: size, Colour: colour },
      brand: null,
      brand_id: null,
      collection_id: null,
      dealer_user_id: index <= 6 ? demoDealerUserId : null,
      family_id: demoProductFamily.id,
      reference_number: null,
      gtin: null,
      mpn: null,
      google_product_category: null,
      google_title: null,
      google_description: null,
      is_featured: false,
      badge: null,
      condition: "new",
      google_sync_status: "not_synced",
      google_product_id: null,
      google_sync_error: null,
      created_at: now,
      updated_at: now,
    };
  })
);

const demoInquiry: Inquiry = {
  id: "00000000-0000-4000-8000-000000000501",
  store_id: localDemoStore.id,
  inquiry_number: "ENQ-20260101-00001",
  product_id: demoProducts[0].id,
  customer_name: "Amina Bello",
  customer_email: "amina@example.com",
  customer_phone: "+234 801 555 0142",
  customer_company: "Bello Retail Ltd",
  customer_address: {
    address_line_1: "18 Marina Road",
    city: "Lagos",
    state: "Lagos",
    postal_code: "101001",
    country: "Nigeria",
  },
  product_url: "https://example-store.com/products/classic-hoodie-small-black",
  requested_quantity: 24,
  message: "Please quote for 24 units with delivery to Lagos and confirm the expected lead time.",
  details: {
    price_request_form: {
      preferred_colour: "Black",
      target_delivery_date: "2026-02-15",
      budget_range: "USD 1,200–1,400",
    },
  },
  admin_notes: "Confirm wholesale pricing before replying.",
  status: "open",
  created_at: now,
  updated_at: now,
};

const demoDealerApplications: DealerApplication[] = [
  {
    id: "00000000-0000-4000-8000-000000000551",
    store_id: localDemoStore.id,
    dealer_user_id: demoDealerUserId,
    company_name: "Atlas Premium Dealers",
    contact_email: "dealer@example.com",
    phone: "+234 803 555 0182",
    tax_id: "NG-VAT-2840193",
    website: "https://example.com/atlas-premium",
    address: "14 Adeola Odeku Street, Victoria Island, Lagos",
    country: "Nigeria",
    message:
      "We specialise in premium apparel distribution and would like to publish our available inventory on the marketplace.",
    status: "approved",
    reviewed_by: "demo_owner",
    reviewed_at: "2025-12-20T10:30:00.000Z",
    created_at: "2025-12-18T09:15:00.000Z",
    updated_at: "2025-12-20T10:30:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000552",
    store_id: localDemoStore.id,
    dealer_user_id: "user_demo_pending_dealer",
    company_name: "Kora Retail Partners",
    contact_email: "applications@kora.example",
    phone: "+234 806 555 0138",
    tax_id: "NG-RC-910284",
    website: "https://example.com/kora-retail",
    address: "22 Obafemi Awolowo Way, Ikeja, Lagos",
    country: "Nigeria",
    message: "We operate three retail locations and want to offer our in-stock products online.",
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    created_at: "2026-01-02T08:45:00.000Z",
    updated_at: "2026-01-02T08:45:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000553",
    store_id: localDemoStore.id,
    dealer_user_id: "user_demo_rejected_dealer",
    company_name: "Northline Trading",
    contact_email: "northline@example.com",
    phone: null,
    tax_id: null,
    website: null,
    address: "Abuja, FCT",
    country: "Nigeria",
    message: "Application submitted without complete company verification documents.",
    status: "rejected",
    reviewed_by: "demo_owner",
    reviewed_at: "2025-12-22T14:00:00.000Z",
    created_at: "2025-12-21T13:10:00.000Z",
    updated_at: "2025-12-22T14:00:00.000Z",
  },
];

const demoCheckoutOrder: CheckoutOrder = {
  id: "00000000-0000-4000-8000-000000000601",
  store_id: localDemoStore.id,
  order_number: "ORD-20260101-00001",
  customer_name: "Chinedu Okafor",
  customer_email: "chinedu@example.com",
  customer_phone: "+234 802 555 0188",
  line_items: [
    {
      product_id: demoProducts[0].id,
      title: demoProducts[0].name,
      price: 59,
      currency: "USD",
      image: demoProducts[0].images[0] ?? null,
      quantity: 2,
      condition: "New",
      brand: "Ecom King Basics",
    },
    {
      product_id: demoProducts[1].id,
      title: demoProducts[1].name,
      price: 64,
      currency: "USD",
      image: demoProducts[1].images[0] ?? null,
      quantity: 1,
      condition: "New",
      brand: "Ecom King Basics",
    },
  ],
  billing_address: {
    full_name: "Chinedu Okafor",
    address_line_1: "27 Admiralty Way",
    city: "Lekki",
    state: "Lagos",
    postal_code: "106104",
    country: "Nigeria",
  },
  delivery_address: {
    full_name: "Chinedu Okafor",
    address_line_1: "12 Bourdillon Road",
    city: "Ikoyi",
    state: "Lagos",
    postal_code: "106104",
    country: "Nigeria",
  },
  subtotal: 182,
  discount_amount: 10,
  shipping_amount: 15,
  tax_amount: 0,
  total_amount: 187,
  currency: "USD",
  payment_method: "bank_transfer",
  payment_status: "pending",
  payment_reference: "ORD-20260101-00001",
  order_status: "pending_payment",
  customer_note: "Please call before delivery.",
  admin_notes: null,
  tracking_number: null,
  auto_invoice: true,
  invoice_number: null,
  invoice_status: "not_sent",
  invoice_sent_at: null,
  created_at: now,
  updated_at: now,
};

const demoPaidCheckoutOrder: CheckoutOrder = {
  id: "00000000-0000-4000-8000-000000000602",
  store_id: localDemoStore.id,
  order_number: "ORD-20251229-00042",
  customer_name: "Amaka Bello",
  customer_email: "amaka@example.com",
  customer_phone: "+234 803 555 0141",
  line_items: [
    {
      product_id: demoProducts[2].id,
      title: demoProducts[2].name,
      price: 69,
      currency: "USD",
      image: demoProducts[2].images[0] ?? null,
      quantity: 1,
      condition: "New",
      brand: "Ecom King Basics",
    },
  ],
  billing_address: {
    full_name: "Amaka Bello",
    company: "Bello Retail Limited",
    address_line_1: "18 Allen Avenue",
    city: "Ikeja",
    state: "Lagos",
    postal_code: "100271",
    country: "Nigeria",
  },
  delivery_address: {
    full_name: "Amaka Bello",
    company: "Bello Retail Limited",
    address_line_1: "18 Allen Avenue",
    city: "Ikeja",
    state: "Lagos",
    postal_code: "100271",
    country: "Nigeria",
  },
  subtotal: 69,
  discount_amount: 0,
  shipping_amount: 8,
  tax_amount: 0,
  total_amount: 77,
  currency: "USD",
  payment_method: "bank_transfer",
  payment_status: "paid",
  payment_reference: "TRF-894201",
  order_status: "processing",
  customer_note: null,
  admin_notes: "Payment confirmed by accounts.",
  tracking_number: null,
  auto_invoice: true,
  invoice_number: "INV-20251229-00042",
  invoice_status: "sent",
  invoice_sent_at: "2025-12-29T14:30:00.000Z",
  created_at: "2025-12-29T14:20:00.000Z",
  updated_at: "2025-12-29T14:30:00.000Z",
};

const demoEscrowOrder: Order = {
  id: "7ec0a001-0000-4000-8000-000000000701",
  store_id: localDemoStore.id,
  buyer_user_id: "user_demo_buyer",
  buyer_name: "Nneka Eze",
  buyer_email: "nneka@example.com",
  dealer_user_id: "user_demo_dealer",
  dealer_name: "Atlas Premium Dealers",
  dealer_email: "dealer@example.com",
  products: [
    {
      product_id: demoProducts[2].id,
      title: demoProducts[2].name,
      price: 69,
      currency: "USD",
      image: demoProducts[2].images[0] ?? null,
      quantity: 1,
      condition: "New",
      brand: "Ecom King Basics",
    },
  ],
  total_amount: 69,
  currency: "USD",
  payment_method: "bank_transfer",
  payment_reference: "https://example.com/demo-escrow-payment-receipt.pdf",
  escrow_status: "dealer_accepted",
  shipping_status: "not_shipped",
  shipping_address: {
    fullName: "Nneka Eze",
    street: "44 Glover Road",
    city: "Ikoyi",
    postalCode: "106104",
    country: "Nigeria",
  },
  tracking_number: null,
  delivery_confirmed_at: null,
  idempotency_key: "demo-escrow-order-0001",
  created_at: now,
  updated_at: now,
};

const demoCompletedDealerOrder: Order = {
  id: "7ec0a001-0000-4000-8000-000000000702",
  store_id: localDemoStore.id,
  buyer_user_id: "user_demo_repeat_buyer",
  buyer_name: "Zainab Musa",
  buyer_email: "zainab@example.com",
  dealer_user_id: demoDealerUserId,
  dealer_name: "Atlas Premium Dealers",
  dealer_email: "dealer@example.com",
  products: [
    {
      product_id: demoProducts[0].id,
      title: demoProducts[0].name,
      price: 59,
      currency: "USD",
      image: demoProducts[0].images[0] ?? null,
      quantity: 2,
      condition: "New",
      brand: "Ecom King Basics",
    },
  ],
  total_amount: 118,
  currency: "USD",
  payment_method: "bank_transfer",
  payment_reference: "https://example.com/demo-completed-payment.pdf",
  escrow_status: "funds_released",
  shipping_status: "delivered",
  shipping_address: {
    fullName: "Zainab Musa",
    street: "8 Ahmadu Bello Way",
    city: "Abuja",
    postalCode: "900211",
    country: "Nigeria",
  },
  tracking_number: "ATLAS-DEL-0192",
  delivery_confirmed_at: "2025-12-28T11:45:00.000Z",
  idempotency_key: "demo-escrow-order-0002",
  created_at: "2025-12-24T08:00:00.000Z",
  updated_at: "2025-12-28T12:00:00.000Z",
};

const demoEscrowMessages: OrderMessage[] = [
  {
    id: "00000000-0000-4000-8000-000000000711",
    order_id: demoEscrowOrder.id,
    sender: "buyer",
    sender_user_id: demoEscrowOrder.buyer_user_id,
    recipient_role: "buyer",
    subject: "Payment and delivery",
    kind: "message",
    message: "<p>Please confirm when my payment receipt has been reviewed.</p>",
    is_read: true,
    created_at: now,
  },
  {
    id: "00000000-0000-4000-8000-000000000712",
    order_id: demoEscrowOrder.id,
    sender: "system",
    sender_user_id: "system",
    recipient_role: "buyer",
    subject: "Dealer accepted",
    kind: "status_update",
    message: "<p>The dealer confirmed that the product is available.</p>",
    is_read: true,
    created_at: now,
  },
  {
    id: "00000000-0000-4000-8000-000000000713",
    order_id: demoEscrowOrder.id,
    sender: "dealer",
    sender_user_id: demoEscrowOrder.dealer_user_id!,
    recipient_role: "dealer",
    subject: "Ready after funds are secured",
    kind: "message",
    message: "<p>The item is reserved and ready for dispatch once escrow confirms the funds.</p>",
    is_read: true,
    created_at: now,
  },
];

const demoRowsByTable: Record<string, Record<string, unknown>[]> = {
  stores: [localDemoStore as unknown as Record<string, unknown>],
  categories: [demoCategory as unknown as Record<string, unknown>],
  brands: [demoBrand as unknown as Record<string, unknown>],
  collections: [demoCollection as unknown as Record<string, unknown>],
  attributes: demoAttributes as unknown as Record<string, unknown>[],
  attribute_values: demoAttributeValues as unknown as Record<string, unknown>[],
  product_families: [demoProductFamily as unknown as Record<string, unknown>],
  products: demoProducts as unknown as Record<string, unknown>[],
  dealer_applications: demoDealerApplications as unknown as Record<string, unknown>[],
  inquiries: [demoInquiry as unknown as Record<string, unknown>],
  checkout_orders: [
    demoCheckoutOrder as unknown as Record<string, unknown>,
    demoPaidCheckoutOrder as unknown as Record<string, unknown>,
  ],
  invoice_settings: [],
  payment_settings: [],
  orders: [
    demoEscrowOrder as unknown as Record<string, unknown>,
    demoCompletedDealerOrder as unknown as Record<string, unknown>,
  ],
  order_messages: demoEscrowMessages as unknown as Record<string, unknown>[],
};

type DemoResult = {
  data: unknown;
  error: null;
};

type DemoMutation = "select" | "insert" | "update" | "upsert" | "delete";

function localDemoInsertDefaults(table: string): Record<string, unknown> {
  if (table !== "products") return {};

  // Supabase supplies these product defaults in the live database. Mirror
  // them here so a product created during local UI work behaves like a real
  // row when the list and edit pages render it afterward.
  return {
    category_id: null,
    short_description: null,
    description: null,
    meta_title: null,
    meta_description: null,
    price: null,
    sale_price: null,
    currency: "USD",
    sku: null,
    stock_quantity: 0,
    status: "draft",
    images: [],
    image_titles: [],
    image_alts: [],
    image_descriptions: [],
    attributes: {},
    brand: null,
    brand_id: null,
    collection_id: null,
    dealer_user_id: null,
    family_id: null,
    reference_number: null,
    gtin: null,
    mpn: null,
    google_product_category: null,
    google_title: null,
    google_description: null,
    is_featured: false,
    badge: null,
    condition: "new",
    google_sync_status: "not_synced",
    google_product_id: null,
    google_sync_error: null,
  };
}

/**
 * Minimal thenable query builder for explicitly enabled local demo sessions.
 * It mirrors only the Supabase methods used by this dashboard and never makes
 * a network request. Writes live in memory for the current dev-server session
 * so UI workflows can be previewed, but disappear when the server restarts.
 */
class LocalDemoQuery implements PromiseLike<DemoResult> {
  private mutation: DemoMutation = "select";
  private payload: unknown = null;
  private singular = false;
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private rowLimit: number | null = null;
  private rowRange: { from: number; to: number } | null = null;
  private upsertConflictColumns = ["id"];

  constructor(private readonly table: string) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is") {
      this.filters.push((row) => row[column] !== value);
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  range(from: number, to: number) {
    this.rowRange = { from, to };
    return this;
  }

  insert(payload: unknown) {
    this.mutation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.mutation = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown, options?: { onConflict?: string }) {
    this.mutation = "upsert";
    this.payload = payload;
    this.upsertConflictColumns =
      options?.onConflict?.split(",").map((column) => column.trim()).filter(Boolean) ?? ["id"];
    return this;
  }

  delete() {
    this.mutation = "delete";
    return this;
  }

  single() {
    this.singular = true;
    return this;
  }

  maybeSingle() {
    this.singular = true;
    return this;
  }

  private execute(): DemoResult {
    const tableRows = (demoRowsByTable[this.table] ??= []);

    if (this.mutation === "delete") {
      const deletedRows: Record<string, unknown>[] = [];
      for (let index = tableRows.length - 1; index >= 0; index -= 1) {
        if (this.filters.every((filter) => filter(tableRows[index]))) {
          deletedRows.unshift(...tableRows.splice(index, 1));
        }
      }
      return { data: this.singular ? deletedRows[0] ?? null : deletedRows, error: null };
    }

    if (this.mutation === "insert") {
      const payloads = (Array.isArray(this.payload) ? this.payload : [this.payload]).filter(
        (value): value is Record<string, unknown> => Boolean(value && typeof value === "object")
      );
      const createdRows = payloads.map((payload) => ({
        ...localDemoInsertDefaults(this.table),
        id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      }));
      tableRows.push(...createdRows);
      return { data: this.singular ? createdRows[0] ?? null : createdRows, error: null };
    }

    if (this.mutation === "upsert") {
      const payloads = (Array.isArray(this.payload) ? this.payload : [this.payload]).filter(
        (value): value is Record<string, unknown> => Boolean(value && typeof value === "object")
      );
      const changedRows = payloads.map((payload) => {
        const existing = tableRows.find((row) =>
          this.upsertConflictColumns.every(
            (column) => payload[column] != null && row[column] === payload[column]
          )
        );
        if (existing) {
          Object.assign(existing, payload, { updated_at: new Date().toISOString() });
          return existing;
        }

        const created = {
          ...localDemoInsertDefaults(this.table),
          id: randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...payload,
        };
        tableRows.push(created);
        return created;
      });
      return { data: this.singular ? changedRows[0] ?? null : changedRows, error: null };
    }

    if (this.mutation === "update") {
      const payload =
        this.payload && typeof this.payload === "object" && !Array.isArray(this.payload)
          ? (this.payload as Record<string, unknown>)
          : {};
      const updatedRows = tableRows
        .filter((row) => this.filters.every((filter) => filter(row)))
        .map((row) => {
          Object.assign(row, payload, { updated_at: new Date().toISOString() });
          return row;
        });
      return { data: this.singular ? updatedRows[0] ?? null : updatedRows, error: null };
    }

    let rows = [...tableRows].filter((row) =>
      this.filters.every((filter) => filter(row))
    );

    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows.sort((left, right) => {
        const leftValue = left[column];
        const rightValue = right[column];
        const comparison = String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
        return ascending ? comparison : -comparison;
      });
    }

    if (this.rowRange) rows = rows.slice(this.rowRange.from, this.rowRange.to + 1);
    else if (this.rowLimit != null) rows = rows.slice(0, this.rowLimit);
    return { data: this.singular ? rows[0] ?? null : rows, error: null };
  }

  then<TResult1 = DemoResult, TResult2 = never>(
    onfulfilled?: ((value: DemoResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export function createLocalDemoClient(): SupabaseClient {
  return {
    from: (table: string) => new LocalDemoQuery(table),
    rpc: (name: string) =>
      Promise.resolve({
        data:
          name === "get_dashboard_stats"
            ? [{ total_products: 0, active_products: 0, total_inquiries: 0, open_inquiries: 0 }]
            : [],
        error: null,
      }),
  } as unknown as SupabaseClient;
}
