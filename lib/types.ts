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
  /** Subset of enabled_locales to actually submit to Google (API push +
   * XML feed link enumeration on the Settings page) — distinct from
   * enabled_locales, which only controls translation. Empty means "not yet
   * narrowed down": falls back to enabled_locales so existing stores keep
   * their current behavior unchanged. Source language is always pushed
   * regardless of this list. */
  google_push_locales: string[];
  /** Where new-inquiry notification emails are sent. Null until the store owner sets it in Settings. */
  notification_email: string | null;
  created_at: string;
  updated_at: string;
};

export type Translation = {
  id: string;
  store_id: string;
  entity_type: "product" | "category" | "attribute_name" | "attribute_value" | "brand" | "collection" | "guide" | "faq" | "legal_page" | "website_string";
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

export type GlossaryRuleType = "preserve" | "always_translate" | "never_translate";

export type GlossaryTerm = {
  id: string;
  store_id: string;
  original_term: string;
  rule_type: GlossaryRuleType;
  /** Per-locale override text, e.g. {"en": "Pre-owned", "de": "Gebraucht"}.
   * Ignored for never_translate rules — those always output original_term. */
  translations: Record<string, string>;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Faq = {
  id: string;
  store_id: string;
  question: string;
  answer: string;
  category: string | null;
  created_at: string;
  updated_at: string;
};

export type LegalPage = {
  id: string;
  store_id: string;
  title: string;
  slug: string;
  content: string | null;
  meta_title: string | null;
  meta_description: string | null;
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
  price: number | null;
  sale_price: number | null;
  currency: string;
  sku: string | null;
  stock_quantity: number;
  status: ProductStatus;
  images: string[];
  image_alts: string[];
  attributes: Record<string, string>;
  brand: string | null;
  /** Optional link to a structured brands row — only used by stores that
   * have created real Brands (e.g. Kariv Glamour). The free-text `brand`
   * column above still exists unchanged and is what Google Merchant sync
   * reads; this is purely for storefront/dashboard display and filtering. */
  brand_id: string | null;
  /** Same idea as brand_id, for stores using structured Collections. */
  collection_id: string | null;
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

export type InquiryStatus = "open" | "closed";

export type Inquiry = {
  id: string;
  store_id: string;
  product_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  message: string | null;
  details: Record<string, unknown>;
  status: InquiryStatus;
  created_at: string;
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
};

export type Order = {
  id: string;
  store_id: string;
  buyer_user_id: string;
  dealer_user_id: string | null;
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

export type OrderMessageSender = "buyer" | "admin";

export type OrderMessage = {
  id: string;
  order_id: string;
  sender: OrderMessageSender;
  sender_user_id: string;
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
