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
  /** Locales to auto-translate into, beyond google_content_language (the
   * store's own source language). e.g. ["en","fr"] for a German-source store. */
  enabled_locales: string[];
  created_at: string;
  updated_at: string;
};

export type Translation = {
  id: string;
  store_id: string;
  entity_type: "product" | "category" | "attribute_name" | "attribute_value";
  entity_id: string;
  field_name: string;
  locale: string;
  value: string;
  translator: "ai" | "human";
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
  attributes: Record<string, string>;
  brand: string | null;
  gtin: string | null;
  mpn: string | null;
  google_product_category: string | null;
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
