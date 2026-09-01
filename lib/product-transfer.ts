import { z } from "zod";
import { slugify } from "@/lib/slug";
import type { Brand, Category, Collection, Product, ProductFamily } from "@/lib/types";

export const PRODUCT_BACKUP_SCHEMA = "ecom-king-products";
export const PRODUCT_BACKUP_VERSION = 1;
export const MAX_PRODUCT_IMPORT_ROWS = 5_000;
export const MAX_PRODUCT_IMPORT_BYTES = 15 * 1024 * 1024;

export const PRODUCT_BACKUP_COLUMNS = [
  { key: "schema_version", description: "Backup schema version. Do not change." },
  { key: "id", description: "Existing product UUID, used to match a product during restore." },
  { key: "name", description: "Product title (required)." },
  { key: "slug", description: "Storefront URL slug (required and unique within the store)." },
  { key: "short_description", description: "Short product-card summary." },
  { key: "description", description: "Complete product description; HTML is preserved." },
  { key: "meta_title", description: "SEO title for search engines." },
  { key: "meta_description", description: "SEO description for search engines." },
  { key: "price", description: "Regular price as a number." },
  { key: "sale_price", description: "Optional sale price as a number." },
  { key: "currency", description: "Three-letter ISO currency code." },
  { key: "sku", description: "Internal stock keeping unit." },
  { key: "stock_quantity", description: "Available stock as a whole number." },
  { key: "status", description: "draft, active, or archived." },
  { key: "condition", description: "new, used, or refurbished." },
  { key: "images", description: "JSON array of product image URLs, in display order." },
  { key: "image_titles", description: "JSON array of SEO image titles aligned with images." },
  { key: "image_alts", description: "JSON array of image alt text aligned with images." },
  { key: "image_descriptions", description: "JSON array of image descriptions aligned with images." },
  { key: "attributes", description: "JSON object of product attribute names and values." },
  { key: "brand", description: "Free-text brand sent to Google Merchant." },
  { key: "brand_id", description: "Structured brand UUID for same-store restores." },
  { key: "brand_name", description: "Structured brand name used as a portable fallback." },
  { key: "brand_slug", description: "Structured brand slug used as a portable fallback." },
  { key: "collection_id", description: "Collection UUID for same-store restores." },
  { key: "collection_name", description: "Collection name used as a portable fallback." },
  { key: "collection_slug", description: "Collection slug used as a portable fallback." },
  {
    key: "dealer_user_id",
    description: "Dealer owner user id for same-store restores; left blank for store-owned products.",
  },
  { key: "family_id", description: "Product-family UUID for same-store restores." },
  { key: "family_name", description: "Product-family name used as a portable fallback." },
  { key: "family_slug", description: "Product-family slug used as a portable fallback." },
  { key: "category_id", description: "Category UUID for same-store restores." },
  { key: "category_name", description: "Category name used as a portable fallback." },
  { key: "category_slug", description: "Category slug used as a portable fallback." },
  { key: "reference_number", description: "Public manufacturer or model reference." },
  { key: "gtin", description: "Global Trade Item Number." },
  { key: "mpn", description: "Manufacturer Part Number." },
  { key: "google_product_category", description: "Google product taxonomy category." },
  { key: "google_title", description: "Optional Google-specific product title override." },
  { key: "google_description", description: "Optional Google-specific description override." },
  { key: "is_featured", description: "true or false." },
  { key: "badge", description: "Optional storefront badge text." },
  { key: "google_sync_status", description: "Exported for audit only; reset when imported." },
  { key: "google_product_id", description: "Exported for audit only; not restored." },
  { key: "google_sync_error", description: "Exported for audit only; not restored." },
  { key: "created_at", description: "Original creation timestamp, exported for audit only." },
  { key: "updated_at", description: "Original update timestamp, exported for audit only." },
] as const;

export type ProductBackupKey = (typeof PRODUCT_BACKUP_COLUMNS)[number]["key"];
export type ProductBackupCell = string | number | boolean | null;
export type ProductBackupRow = Record<ProductBackupKey, ProductBackupCell>;

export type ProductBackupLookups = {
  categories: Category[];
  brands: Brand[];
  collections: Collection[];
  families: ProductFamily[];
};

function byId<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

export function buildProductBackupRows(products: Product[], lookups: ProductBackupLookups) {
  const categoryById = byId(lookups.categories);
  const brandById = byId(lookups.brands);
  const collectionById = byId(lookups.collections);
  const familyById = byId(lookups.families);

  return products.map((product): ProductBackupRow => {
    const category = product.category_id ? categoryById.get(product.category_id) : null;
    const brand = product.brand_id ? brandById.get(product.brand_id) : null;
    const collection = product.collection_id ? collectionById.get(product.collection_id) : null;
    const family = product.family_id ? familyById.get(product.family_id) : null;

    return {
      schema_version: PRODUCT_BACKUP_VERSION,
      id: product.id,
      name: product.name,
      slug: product.slug,
      short_description: product.short_description,
      description: product.description,
      meta_title: product.meta_title,
      meta_description: product.meta_description,
      price: product.price,
      sale_price: product.sale_price,
      currency: product.currency,
      sku: product.sku,
      stock_quantity: product.stock_quantity,
      status: product.status,
      condition: product.condition,
      images: JSON.stringify(product.images ?? []),
      image_titles: JSON.stringify(product.image_titles ?? []),
      image_alts: JSON.stringify(product.image_alts ?? []),
      image_descriptions: JSON.stringify(product.image_descriptions ?? []),
      attributes: JSON.stringify(product.attributes ?? {}),
      brand: product.brand,
      brand_id: product.brand_id,
      brand_name: brand?.name ?? null,
      brand_slug: brand?.slug ?? null,
      collection_id: product.collection_id,
      collection_name: collection?.name ?? null,
      collection_slug: collection?.slug ?? null,
      dealer_user_id: product.dealer_user_id,
      family_id: product.family_id,
      family_name: family?.name ?? null,
      family_slug: family?.slug ?? null,
      category_id: product.category_id,
      category_name: category?.name ?? null,
      category_slug: category?.slug ?? null,
      reference_number: product.reference_number,
      gtin: product.gtin,
      mpn: product.mpn,
      google_product_category: product.google_product_category,
      google_title: product.google_title,
      google_description: product.google_description,
      is_featured: product.is_featured,
      badge: product.badge,
      google_sync_status: product.google_sync_status,
      google_product_id: product.google_product_id,
      google_sync_error: product.google_sync_error,
      created_at: product.created_at,
      updated_at: product.updated_at,
    };
  });
}

function nullableText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function requiredText(value: unknown) {
  return String(value ?? "").trim();
}

function nullableNumber(value: unknown) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function wholeNumber(value: unknown) {
  if (value == null || String(value).trim() === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["true", "yes", "1", "y"].includes(String(value ?? "").trim().toLowerCase());
}

function jsonStringArray(value: unknown, field: string): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? ""));
  if (value == null || String(value).trim() === "") return [];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.map((item) => String(item ?? ""));
  } catch {
    throw new Error(`${field} must be a JSON array, for example ["https://example.com/image.jpg"].`);
  }
}

function jsonAttributes(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [String(key), String(item ?? "")])
    );
  }
  if (value == null || String(value).trim() === "") return {};
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return Object.fromEntries(
      Object.entries(parsed).map(([key, item]) => [String(key), String(item ?? "")])
    );
  } catch {
    throw new Error('attributes must be a JSON object, for example {"Size":"Large"}.');
  }
}

const nullableUuid = z.string().uuid().nullable();
const importProductSchema = z.object({
  sourceId: nullableUuid,
  name: z.string().min(1, "name is required").max(500),
  slug: z.string().min(1, "slug is required").max(500),
  short_description: z.string().max(2_000).nullable(),
  description: z.string().max(100_000).nullable(),
  meta_title: z.string().max(200).nullable(),
  meta_description: z.string().max(500).nullable(),
  price: z.number().finite().min(0).nullable(),
  sale_price: z.number().finite().min(0).nullable(),
  currency: z.string().length(3),
  sku: z.string().max(200).nullable(),
  stock_quantity: z.number().int().min(0),
  status: z.enum(["draft", "active", "archived"]),
  condition: z.enum(["new", "used", "refurbished"]),
  images: z.array(z.string().min(1).max(2_000)).max(20),
  image_titles: z.array(z.string().max(500)).max(20),
  image_alts: z.array(z.string().max(500)).max(20),
  image_descriptions: z.array(z.string().max(2_000)).max(20),
  attributes: z.record(z.string().max(100), z.string().max(1_000)),
  brand: z.string().max(200).nullable(),
  category_id: nullableUuid,
  category_name: z.string().max(500).nullable(),
  category_slug: z.string().max(500).nullable(),
  brand_id: nullableUuid,
  brand_name: z.string().max(500).nullable(),
  brand_slug: z.string().max(500).nullable(),
  collection_id: nullableUuid,
  collection_name: z.string().max(500).nullable(),
  collection_slug: z.string().max(500).nullable(),
  dealer_user_id: z.string().max(200).nullable(),
  family_id: nullableUuid,
  family_name: z.string().max(500).nullable(),
  family_slug: z.string().max(500).nullable(),
  reference_number: z.string().max(200).nullable(),
  gtin: z.string().max(200).nullable(),
  mpn: z.string().max(200).nullable(),
  google_product_category: z.string().max(500).nullable(),
  google_title: z.string().max(150).nullable(),
  google_description: z.string().max(5_000).nullable(),
  is_featured: z.boolean(),
  badge: z.string().max(100).nullable(),
});

export type ParsedProductImport = z.infer<typeof importProductSchema>;

function aligned(values: string[], length: number) {
  return Array.from({ length }, (_, index) => values[index] ?? "");
}

export function parseProductImportRow(raw: Record<string, unknown>): ParsedProductImport {
  const images = jsonStringArray(raw.images, "images").filter(Boolean);
  const rawSlug = nullableText(raw.slug) || requiredText(raw.name);

  return importProductSchema.parse({
    sourceId: nullableText(raw.id),
    name: requiredText(raw.name),
    slug: slugify(rawSlug),
    short_description: nullableText(raw.short_description),
    description: nullableText(raw.description),
    meta_title: nullableText(raw.meta_title),
    meta_description: nullableText(raw.meta_description),
    price: nullableNumber(raw.price),
    sale_price: nullableNumber(raw.sale_price),
    currency: (nullableText(raw.currency) || "USD").toUpperCase(),
    sku: nullableText(raw.sku),
    stock_quantity: wholeNumber(raw.stock_quantity),
    status: nullableText(raw.status) || "draft",
    condition: nullableText(raw.condition) || "new",
    images,
    image_titles: aligned(jsonStringArray(raw.image_titles, "image_titles"), images.length),
    image_alts: aligned(jsonStringArray(raw.image_alts, "image_alts"), images.length),
    image_descriptions: aligned(
      jsonStringArray(raw.image_descriptions, "image_descriptions"),
      images.length
    ),
    attributes: jsonAttributes(raw.attributes),
    brand: nullableText(raw.brand),
    category_id: nullableText(raw.category_id),
    category_name: nullableText(raw.category_name),
    category_slug: nullableText(raw.category_slug),
    brand_id: nullableText(raw.brand_id),
    brand_name: nullableText(raw.brand_name),
    brand_slug: nullableText(raw.brand_slug),
    collection_id: nullableText(raw.collection_id),
    collection_name: nullableText(raw.collection_name),
    collection_slug: nullableText(raw.collection_slug),
    dealer_user_id: nullableText(raw.dealer_user_id),
    family_id: nullableText(raw.family_id),
    family_name: nullableText(raw.family_name),
    family_slug: nullableText(raw.family_slug),
    reference_number: nullableText(raw.reference_number),
    gtin: nullableText(raw.gtin),
    mpn: nullableText(raw.mpn),
    google_product_category: nullableText(raw.google_product_category),
    google_title: nullableText(raw.google_title),
    google_description: nullableText(raw.google_description),
    is_featured: booleanValue(raw.is_featured),
    badge: nullableText(raw.badge),
  });
}

function safeCsvText(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: ProductBackupCell) {
  if (value == null) return "";
  const text = typeof value === "string" ? safeCsvText(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function productRowsToCsv(rows: ProductBackupRow[]) {
  const headers = PRODUCT_BACKUP_COLUMNS.map((column) => column.key);
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function parseCsvTable(input: string): Record<string, unknown>[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unfinished quoted value.");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];
  const headers = headerRow.map((header) => header.trim());
  return dataRows
    .filter((values) => values.some((value) => value.trim() !== ""))
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => {
          const value = values[index] ?? "";
          const restored = /^'[=+\-@]/.test(value) ? value.slice(1) : value;
          return [header, restored];
        })
      )
    );
}
