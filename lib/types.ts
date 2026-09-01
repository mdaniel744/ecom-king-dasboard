export type Store = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  owner_user_id: string;
  google_merchant_id: string | null;
  google_merchant_datasource_id: string | null;
  google_content_language: string;
  google_feed_label: string;
  /** Delivery/target markets for Google Merchant sync (country feed labels,
   * e.g. ["DE","BE"]). One product gets submitted once per market x per
   * enabled locale. Always non-empty in practice — backfilled from
   * google_feed_label for stores created before this field existed. */
  google_feed_labels: string[];
  /** The URL path segment for product detail pages on this store's storefront
   * (e.g. "products" for mycontainergmbh.com/products/slug). Varies per
   * store — confirmed by testing the real live site, never assumed. */
  product_url_path: string;
  /** Per-locale override for the product URL word, e.g. {"fr": "conteneurs"}
   * -- for a store whose real site translates the path segment itself per
   * language, not just the surrounding slug (confirmed live on STF:
   * containers/container/contenedores/conteneurs across nl/de/es/fr). A
   * locale with no entry here falls back to product_url_path. Empty by
   * default -- most stores use one word for every language. */
  product_url_path_overrides: Record<string, string>;
  /** Whether this store's OWN source language still gets an explicit locale
   * prefix (e.g. stfcontainer.com/nl/... even though nl is the source
   * language) rather than the more common no-prefix-for-source convention
   * (diecontainers.com/produkt/... with no /de/). Confirmed to genuinely
   * differ per storefront — don't assume either default without testing
   * the real site, same as product_url_path. */
  source_locale_has_prefix: boolean;
  /** Locales to auto-translate into, beyond google_content_language (the
   * store's own source language). e.g. ["en","fr"] for a German-source store. */
  enabled_locales: string[];
  /** Subset of enabled_locales to actually submit to Google via the API push
   * — distinct from enabled_locales, which only controls translation (and
   * from the XML feed, which still enumerates every enabled_locales combo
   * regardless of this list). Empty means nothing extra has been opted in
   * yet: only the source language is pushed. Never falls back to
   * enabled_locales — an empty selection must mean "push nothing extra,"
   * not "push everything," since that's what leaving every box unchecked
   * in Settings actually means to the person doing it. */
  google_push_locales: string[];
  /** Per-market VAT rate as a percentage, e.g. {"NL": 21, "DE": 19} -- keyed
   * by the same market codes as google_feed_labels. Product prices are
   * always stored VAT-exclusive (net); a market with a rate configured here
   * gets price * (1 + rate/100) submitted to Google Merchant instead of the
   * raw net price. A market with no entry gets no VAT added (legacy
   * behavior, unchanged) -- deliberately opt-in per market, not a platform
   * default, since the correct rate genuinely varies by destination country
   * and nobody should get a silently-wrong price the moment this shipped. */
  vat_rates: Record<string, number>;
  /** Where new-inquiry notification emails are sent. Null until the store owner sets it in Settings. */
  notification_email: string | null;
  /** Branded "From" display name for outbound emails (e.g. "Kariv Glamour").
   * Falls back to `name` when unset — every store gets a branded sender,
   * not the generic platform name, without needing to fill this in. */
  notification_sender_name: string | null;
  created_at: string;
  updated_at: string;
};

export type Translation = {
  id: string;
  store_id: string;
  entity_type: "product" | "category" | "product_family" | "attribute_name" | "attribute_value" | "brand" | "collection" | "guide" | "faq" | "legal_page" | "website_string";
  entity_id: string;
  field_name: string;
  locale: string;
  value: string;
  translator: "ai" | "human";
  created_at: string;
  updated_at: string;
};

export type Brand = {
  id: string;
  store_id: string;
  name: string;
  slug: string;
  short_description: string | null;
  long_description: string | null;
  disclaimer: string | null;
  meta_title: string | null;
  meta_description: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  hero_image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Collection = {
  id: string;
  store_id: string;
  brand_id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Guide = {
  id: string;
  store_id: string;
  title: string;
  slug: string;
  /** Free-form, store-defined (e.g. "Buying Guide", "Care Guide") — never a
   * hardcoded platform enum, same principle as attribute vocabulary. */
  category: string | null;
  excerpt: string | null;
  /** Markdown, not plain text — richer formatting than product descriptions. */
  content: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
};

export type DealerApplicationStatus = "pending" | "approved" | "rejected";

export type DealerApplication = {
  id: string;
  store_id: string;
  dealer_user_id: string;
  company_name: string;
  contact_email: string;
  phone: string | null;
  tax_id: string | null;
  website: string | null;
  address: string | null;
  country: string | null;
  message: string | null;
  status: DealerApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WebsiteString = {
  id: string;
  store_id: string;
  key: string;
  default_value: string;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  store_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  image_url: string | null;
  description: string | null;
  is_featured: boolean;
  display_order: number;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
};

export type StoreMemberRole = "owner" | "manager" | "staff";

export type StoreMember = {
  id: string;
  store_id: string;
  user_id: string;
  role: StoreMemberRole;
  created_at: string;
};

export type Attribute = {
  id: string;
  store_id: string;
  name: string;
  created_at: string;
};

export type AttributeValue = {
  id: string;
  attribute_id: string;
  value: string;
  label: string | null;
  image_url: string | null;
  description: string | null;
  created_at: string;
};

export type ProductStatus = "draft" | "active" | "archived";
export type ProductCondition = "new" | "used" | "refurbished";
export type GoogleSyncStatus = "not_synced" | "pending" | "synced" | "error";

export type Product = {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  price: number | null;
  sale_price: number | null;
  currency: string;
  sku: string | null;
  stock_quantity: number;
  status: ProductStatus;
  images: string[];
  image_titles: string[];
  image_alts: string[];
  image_descriptions: string[];
  attributes: Record<string, string>;
  brand: string | null;
  /** Optional link to a structured brands row — only used by stores that
   * have created real Brands (e.g. Kariv Glamour). The free-text `brand`
   * column above still exists unchanged and is what Google Merchant sync
   * reads; this is purely for storefront/dashboard display and filtering. */
  brand_id: string | null;
  /** Same idea as brand_id, for stores using structured Collections. */
  collection_id: string | null;
  /** Clerk user id for a dealer-owned marketplace listing. Null means the
   * store itself owns the listing. */
  dealer_user_id: string | null;
  /** Optional link to a product_families row — null (the default, and every
   * product before this field existed) means this product is fully
   * standalone, exactly as it's always behaved. When set, the storefront
   * groups this product with its family siblings and Google Merchant sync
   * uses the family as item_group_id instead of this product's own id. This
   * product's own price/SKU/slug/images/everything else stays completely
   * independent either way — family_id only adds grouping, never merges
   * data between rows. */
  family_id: string | null;
  /** Public-facing manufacturer reference (e.g. a watch reference number) —
   * distinct from sku, which is internal-only and never shown to customers. */
  reference_number: string | null;
  gtin: string | null;
  mpn: string | null;
  google_product_category: string | null;
  /** Optional overrides for what's actually sent to Google — falls back to
   * name/description when null. Lets a store write different copy for
   * Google's algorithm vs. what a human visitor sees on the product page. */
  google_title: string | null;
  google_description: string | null;
  is_featured: boolean;
  badge: string | null;
  condition: ProductCondition;
  google_sync_status: GoogleSyncStatus;
  google_product_id: string | null;
  google_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A lightweight grouping wrapper over otherwise fully independent products
 * (e.g. "20ft Standard Container" grouping several separate Size/Condition/
 * Colour products). Deliberately holds only shared, family-level display
 * info — no price, stock, SKU, or anything that already exists correctly
 * per-product on `products`. Assigning a product to a family (via
 * products.family_id) never changes that product's own data; it only adds
 * a grouping relationship for storefront display and Google Merchant's
 * item_group_id.
 */
export type ProductFamily = {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  images: string[];
  is_featured: boolean;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
};

export type InquiryStatus = "open" | "closed";

export type Inquiry = {
  id: string;
  store_id: string;
  inquiry_number?: string | null;
  product_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_company?: string | null;
  customer_address?: Record<string, unknown> | null;
  product_url?: string | null;
  requested_quantity?: number | null;
  message: string | null;
  details: Record<string, unknown>;
  admin_notes?: string | null;
  status: InquiryStatus;
  created_at: string;
  updated_at?: string;
};

export type CheckoutOrderStatus =
  | "pending_payment"
  | "paid"
  | "processing"
  | "ready_to_ship"
  | "shipped"
  | "completed"
  | "cancelled";

export type CheckoutPaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type CheckoutInvoiceStatus = "not_sent" | "sent" | "failed";
export type InvoiceTemplate = "classic" | "modern" | "minimal" | "corporate";

export type InvoiceSettings = {
  store_id: string;
  template: InvoiceTemplate;
  accent_color: string;
  font_family: "sans" | "serif";
  logo_url: string | null;
  business_name: string;
  business_address: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_website: string | null;
  company_registration_number: string | null;
  vat_registration_number: string | null;
  tax_id: string | null;
  account_manager_name: string | null;
  account_manager_email: string | null;
  account_manager_phone: string | null;
  invoice_prefix: string;
  due_days: number;
  payment_terms: string | null;
  delivery_terms: string | null;
  deposit_percentage: number;
  commercial_terms: string | null;
  auto_send: boolean;
  footer_note: string | null;
  show_logo: boolean;
  show_billing_address: boolean;
  show_shipping_address: boolean;
  show_tax_breakdown: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type CardPaymentProvider = "stripe" | "paystack" | "flutterwave" | "other";

export type PaymentSettings = {
  store_id: string;
  bank_transfer_enabled: boolean;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_country: string | null;
  bank_currency: string;
  bank_iban: string | null;
  bank_swift_bic: string | null;
  bank_instructions: string | null;
  card_enabled: boolean;
  card_provider: CardPaymentProvider | null;
  card_checkout_label: string | null;
  crypto_enabled: boolean;
  crypto_assets: string[];
  crypto_wallet_details: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CustomerAddress = {
  full_name?: string;
  company?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

export type CheckoutOrder = {
  id: string;
  store_id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  line_items: OrderLineItem[];
  billing_address: CustomerAddress | null;
  delivery_address: CustomerAddress | null;
  subtotal: number;
  discount_amount: number;
  shipping_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  payment_method: "bank_transfer";
  payment_status: CheckoutPaymentStatus;
  payment_reference: string | null;
  order_status: CheckoutOrderStatus;
  customer_note: string | null;
  admin_notes: string | null;
  tracking_number: string | null;
  auto_invoice: boolean;
  invoice_number: string | null;
  invoice_status: CheckoutInvoiceStatus;
  invoice_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderEscrowStatus =
  | "pending_review"
  | "dealer_accepted"
  | "funds_secured"
  | "shipped"
  | "verified"
  | "funds_released"
  | "cancelled";
export type OrderPaymentMethod = "bank_transfer" | "crypto";
export type OrderShippingStatus = "not_shipped" | "shipped" | "delivered";

export type OrderLineItem = {
  product_id: string;
  title: string;
  price: number;
  currency: string;
  image: string | null;
  quantity: number;
  condition?: string;
  brand?: string;
};

export type Order = {
  id: string;
  store_id: string;
  buyer_user_id: string;
  buyer_name?: string | null;
  buyer_email?: string | null;
  dealer_user_id: string | null;
  dealer_name?: string | null;
  dealer_email?: string | null;
  products: OrderLineItem[];
  total_amount: number;
  currency: string;
  payment_method: OrderPaymentMethod;
  payment_reference: string | null;
  escrow_status: OrderEscrowStatus;
  shipping_status: OrderShippingStatus;
  shipping_address: Record<string, unknown> | null;
  tracking_number: string | null;
  delivery_confirmed_at: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

export type OrderMessageSender = "buyer" | "admin" | "system" | "dealer";
/** Which conversation this row belongs to — separate from `sender` (who
 * wrote it). An admin reply to the buyer and an admin reply to the dealer
 * both have sender: "admin", but different recipient_role, so each party's
 * inbox only ever shows their own thread. */
export type OrderMessageRecipient = "buyer" | "dealer";

export type OrderMessage = {
  id: string;
  order_id: string;
  sender: OrderMessageSender;
  sender_user_id: string;
  recipient_role: OrderMessageRecipient;
  subject: string | null;
  kind: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type DisputeReason = "item_not_as_described" | "item_not_received" | "damaged" | "other";
export type DisputeStatus = "open" | "under_review" | "resolved_buyer" | "resolved_dealer" | "closed";

export type Dispute = {
  id: string;
  order_id: string;
  opened_by: string;
  reason: DisputeReason;
  description: string | null;
  status: DisputeStatus;
  mediator_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  store_id: string;
  clerk_user_id: string;
  shipping_address: Record<string, unknown> | null;
  billing_address: Record<string, unknown> | null;
  wishlist: unknown[];
  marketing_consent: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Written by the storefront when a buyer/dealer grants browser notification
 * permission — read by this dashboard's push-sending code (lib/push.ts). */
export type PushSubscriptionRow = {
  id: string;
  store_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

/** Persistent notification history — feeds the storefront's notification
 * bell, readable even if the live push itself never arrived. */
export type Notification = {
  id: string;
  store_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};
