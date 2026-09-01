import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentStore } from "@/lib/get-current-store";
import {
  MAX_PRODUCT_IMPORT_BYTES,
  MAX_PRODUCT_IMPORT_ROWS,
  parseCsvTable,
  parseProductImportRow,
  PRODUCT_BACKUP_SCHEMA,
  type ParsedProductImport,
} from "@/lib/product-transfer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  Brand,
  Category,
  Collection,
  DealerApplication,
  Product,
  ProductFamily,
} from "@/lib/types";

export const runtime = "nodejs";

const PAGE_SIZE = 500;
const ACCEPTED_EXTENSIONS = new Set(["xlsx", "csv", "json"]);

type NamedRelation = { id: string; name: string; slug: string };
type RelationMaps = {
  ids: Map<string, NamedRelation>;
  names: Map<string, NamedRelation>;
  slugs: Map<string, NamedRelation>;
};

async function fetchStoreRows<T>(table: string, storeId: string): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value == null || typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  return cell.text;
}

async function rowsFromWorkbook(file: File): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet("Products") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("The Excel workbook does not contain a worksheet.");

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    headers[columnNumber - 1] = cell.text.trim();
  });
  if (!headers.some(Boolean)) throw new Error("The first Excel row must contain column names.");

  const rows: Record<string, unknown>[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = headers.map((header, index) => (header ? cellValue(row.getCell(index + 1)) : null));
    if (values.every((value) => value == null || String(value).trim() === "")) continue;
    rows.push(
      Object.fromEntries(
        headers.flatMap((header, index) => (header ? [[header, values[index]]] : []))
      )
    );
  }
  return rows;
}

async function rowsFromJson(file: File): Promise<Record<string, unknown>[]> {
  const parsed: unknown = JSON.parse(await file.text());
  const products = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && "products" in parsed
      ? (parsed as { products: unknown }).products
      : null;

  if (!Array.isArray(products)) {
    throw new Error("The JSON file must contain a products array.");
  }
  if (
    parsed &&
    !Array.isArray(parsed) &&
    typeof parsed === "object" &&
    "schema" in parsed &&
    (parsed as { schema?: unknown }).schema !== PRODUCT_BACKUP_SCHEMA
  ) {
    throw new Error("This JSON file is not an Ecom King product backup.");
  }

  return products.map((product, index) => {
    if (!product || typeof product !== "object" || Array.isArray(product)) {
      throw new Error(`JSON product ${index + 1} must be an object.`);
    }
    return product as Record<string, unknown>;
  });
}

async function readImportRows(file: File, extension: string) {
  if (extension === "xlsx") return rowsFromWorkbook(file);
  if (extension === "csv") return parseCsvTable(await file.text());
  return rowsFromJson(file);
}

function relationMaps(relations: NamedRelation[]): RelationMaps {
  return {
    ids: new Map(relations.map((relation) => [relation.id, relation])),
    names: new Map(relations.map((relation) => [relation.name.trim().toLowerCase(), relation])),
    slugs: new Map(relations.map((relation) => [relation.slug.trim().toLowerCase(), relation])),
  };
}

function resolveRelation(
  label: string,
  id: string | null,
  name: string | null,
  slug: string | null,
  maps: RelationMaps,
  productName: string,
  warnings: string[]
) {
  const match =
    (id ? maps.ids.get(id) : null) ??
    (slug ? maps.slugs.get(slug.trim().toLowerCase()) : null) ??
    (name ? maps.names.get(name.trim().toLowerCase()) : null);
  if (!match && (id || name || slug)) {
    warnings.push(`${productName}: ${label} “${name || slug || id}” was not found and was left unassigned.`);
  }
  return match?.id ?? null;
}

function resolveDealerUserId(
  dealerUserId: string | null,
  validDealerUserIds: Set<string>,
  productName: string,
  warnings: string[]
) {
  if (!dealerUserId) return null;
  if (validDealerUserIds.has(dealerUserId)) return dealerUserId;
  warnings.push(
    `${productName}: dealer “${dealerUserId}” was not found in this store and the product was restored as store-owned.`
  );
  return null;
}

function validationMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : "Invalid product data.";
}

function productPayload(
  product: ParsedProductImport,
  storeId: string,
  relations: {
    category_id: string | null;
    brand_id: string | null;
    collection_id: string | null;
    dealer_user_id: string | null;
    family_id: string | null;
  }
) {
  return {
    store_id: storeId,
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
    images: product.images,
    image_titles: product.image_titles,
    image_alts: product.image_alts,
    image_descriptions: product.image_descriptions,
    attributes: product.attributes,
    brand: product.brand,
    ...relations,
    reference_number: product.reference_number,
    gtin: product.gtin,
    mpn: product.mpn,
    google_product_category: product.google_product_category,
    google_title: product.google_title,
    google_description: product.google_description,
    is_featured: product.is_featured,
    badge: product.badge,
    google_sync_status: "not_synced",
    google_product_id: null,
    google_sync_error: null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an Excel, CSV, or JSON product file." }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_PRODUCT_IMPORT_BYTES) {
      return NextResponse.json({ error: "The import file must be between 1 byte and 15 MB." }, { status: 400 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: "Only .xlsx, .csv, and .json files are supported." }, { status: 400 });
    }

    let rawRows: Record<string, unknown>[];
    try {
      rawRows = await readImportRows(file, extension);
    } catch (error) {
      return NextResponse.json({ error: validationMessage(error) }, { status: 400 });
    }
    if (rawRows.length === 0) {
      return NextResponse.json({ error: "The file does not contain any products." }, { status: 400 });
    }
    if (rawRows.length > MAX_PRODUCT_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `A single import can contain at most ${MAX_PRODUCT_IMPORT_ROWS.toLocaleString()} products.` },
        { status: 400 }
      );
    }

    const validationErrors: Array<{ row: number; message: string }> = [];
    const parsedRows: ParsedProductImport[] = [];
    rawRows.forEach((row, index) => {
      try {
        parsedRows.push(parseProductImportRow(row));
      } catch (error) {
        if (validationErrors.length < 25) {
          validationErrors.push({ row: index + 2, message: validationMessage(error) });
        }
      }
    });

    const seenIds = new Set<string>();
    const seenSlugs = new Set<string>();
    parsedRows.forEach((product, index) => {
      if (product.sourceId && seenIds.has(product.sourceId)) {
        validationErrors.push({ row: index + 2, message: `Duplicate product id ${product.sourceId}.` });
      }
      if (seenSlugs.has(product.slug)) {
        validationErrors.push({ row: index + 2, message: `Duplicate product slug ${product.slug}.` });
      }
      if (product.sourceId) seenIds.add(product.sourceId);
      seenSlugs.add(product.slug);
    });

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: "No products were imported. Correct the highlighted rows and try again.",
          validationErrors: validationErrors.slice(0, 25),
        },
        { status: 422 }
      );
    }

    const store = await getCurrentStore();
    const [existingProducts, categories, brands, collections, families, dealerApplications] = await Promise.all([
      fetchStoreRows<Product>("products", store.id),
      fetchStoreRows<Category>("categories", store.id),
      fetchStoreRows<Brand>("brands", store.id),
      fetchStoreRows<Collection>("collections", store.id),
      fetchStoreRows<ProductFamily>("product_families", store.id),
      fetchStoreRows<DealerApplication>("dealer_applications", store.id),
    ]);
    const byId = new Map(existingProducts.map((product) => [product.id, product]));
    const bySlug = new Map(existingProducts.map((product) => [product.slug, product]));
    const categoryMaps = relationMaps(categories);
    const brandMaps = relationMaps(brands);
    const collectionMaps = relationMaps(collections);
    const familyMaps = relationMaps(families);
    const validDealerUserIds = new Set(
      dealerApplications.map((application) => application.dealer_user_id)
    );
    const warnings: string[] = [];
    const planned = parsedRows.map((product, index) => {
      const idMatch = product.sourceId ? byId.get(product.sourceId) : null;
      const slugMatch = bySlug.get(product.slug);
      if (idMatch && slugMatch && idMatch.id !== slugMatch.id) {
        validationErrors.push({
          row: index + 2,
          message: `The product id and slug match two different existing products.`,
        });
      }
      const existing = idMatch ?? slugMatch ?? null;
      return {
        existing,
        payload: productPayload(product, store.id, {
          category_id: resolveRelation(
            "category",
            product.category_id,
            product.category_name,
            product.category_slug,
            categoryMaps,
            product.name,
            warnings
          ),
          brand_id: resolveRelation(
            "brand",
            product.brand_id,
            product.brand_name,
            product.brand_slug,
            brandMaps,
            product.name,
            warnings
          ),
          collection_id: resolveRelation(
            "collection",
            product.collection_id,
            product.collection_name,
            product.collection_slug,
            collectionMaps,
            product.name,
            warnings
          ),
          dealer_user_id: resolveDealerUserId(
            product.dealer_user_id,
            validDealerUserIds,
            product.name,
            warnings
          ),
          family_id: resolveRelation(
            "product family",
            product.family_id,
            product.family_name,
            product.family_slug,
            familyMaps,
            product.name,
            warnings
          ),
        }),
      };
    });

    const seenTargets = new Set<string>();
    planned.forEach(({ existing }, index) => {
      if (!existing) return;
      if (seenTargets.has(existing.id)) {
        validationErrors.push({ row: index + 2, message: "Two rows target the same existing product." });
      }
      seenTargets.add(existing.id);
    });
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: "No products were imported. Correct the highlighted rows and try again.",
          validationErrors: validationErrors.slice(0, 25),
        },
        { status: 422 }
      );
    }

    const created = planned.filter((item) => !item.existing).length;
    const updated = planned.length - created;
    const { error: importError } = await supabaseAdmin.from("products").upsert(
      planned.map((item) => ({
        ...item.payload,
        id: item.existing?.id ?? randomUUID(),
      })),
      { onConflict: "id" }
    );
    if (importError) throw new Error(`Failed to save imported products: ${importError.message}`);

    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/product-families");
    return NextResponse.json({ ok: true, created, updated, warnings: warnings.slice(0, 25) });
  } catch (error) {
    console.error("Product import failed:", error);
    return NextResponse.json(
      { error: "The import could not be completed. No further products were processed." },
      { status: 500 }
    );
  }
}
