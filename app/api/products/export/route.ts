import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentStore } from "@/lib/get-current-store";
import {
  buildProductBackupRows,
  PRODUCT_BACKUP_COLUMNS,
  PRODUCT_BACKUP_SCHEMA,
  PRODUCT_BACKUP_VERSION,
  productRowsToCsv,
  type ProductBackupRow,
} from "@/lib/product-transfer";
import { slugify } from "@/lib/slug";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Brand, Category, Collection, Product, ProductFamily } from "@/lib/types";

export const runtime = "nodejs";

type ExportFormat = "xlsx" | "csv" | "json";

const PAGE_SIZE = 500;

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

function structuredBackupRow(row: ProductBackupRow) {
  return {
    ...row,
    images: JSON.parse(String(row.images || "[]")),
    image_titles: JSON.parse(String(row.image_titles || "[]")),
    image_alts: JSON.parse(String(row.image_alts || "[]")),
    image_descriptions: JSON.parse(String(row.image_descriptions || "[]")),
    attributes: JSON.parse(String(row.attributes || "{}")),
  };
}

function workbookFor(rows: ProductBackupRow[], storeName: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ecom King Dashboard";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = `${storeName} product backup`;
  workbook.subject = "Complete product data backup and restore file";

  const productsSheet = workbook.addWorksheet("Products", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const columnKeys = PRODUCT_BACKUP_COLUMNS.map((column) => column.key);
  productsSheet.columns = PRODUCT_BACKUP_COLUMNS.map(({ key }) => ({
    header: key,
    key,
    width:
      key === "description" || key === "google_description"
        ? 52
        : key === "images" || key === "attributes"
          ? 44
          : key.includes("description")
            ? 38
            : key === "name" || key.includes("title")
              ? 30
              : 22,
  }));
  productsSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnKeys.length },
  };

  const header = productsSheet.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
  header.alignment = { vertical: "middle" };

  for (const row of rows) productsSheet.addRow(row);
  for (const key of ["price", "sale_price"]) {
    productsSheet.getColumn(key).numFmt = "0.00";
  }
  productsSheet.getColumn("stock_quantity").numFmt = "0";
  productsSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: "top", wrapText: false };
  });

  const instructions = workbook.addWorksheet("Instructions", {
    views: [{ state: "frozen", ySplit: 7 }],
  });
  instructions.columns = [
    { key: "field", width: 34 },
    { key: "details", width: 100 },
  ];
  instructions.addRow(["Ecom King product backup"]);
  instructions.addRow(["Store", storeName]);
  instructions.addRow(["Schema", PRODUCT_BACKUP_SCHEMA]);
  instructions.addRow(["Schema version", PRODUCT_BACKUP_VERSION]);
  instructions.addRow([
    "How restore works",
    "Rows are validated first. Existing products are matched by same-store product ID or slug; otherwise a new product is created.",
  ]);
  instructions.addRow([
    "Structured data",
    "images, image_titles, image_alts and image_descriptions are JSON arrays. attributes is a JSON object.",
  ]);
  instructions.addRow(["Column", "Description"]);
  for (const column of PRODUCT_BACKUP_COLUMNS) {
    instructions.addRow([column.key, column.description]);
  }
  instructions.getRow(1).font = { bold: true, size: 16, color: { argb: "FF6D28D9" } };
  instructions.getRow(7).font = { bold: true, color: { argb: "FFFFFFFF" } };
  instructions.getRow(7).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF6D28D9" },
  };
  instructions.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });

  return workbook;
}

function downloadHeaders(filename: string, contentType: string) {
  return {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Type": contentType,
  };
}

export async function GET(request: NextRequest) {
  const requestedFormat = request.nextUrl.searchParams.get("format") ?? "xlsx";
  if (!(["xlsx", "csv", "json"] as string[]).includes(requestedFormat)) {
    return NextResponse.json({ error: "Choose xlsx, csv, or json." }, { status: 400 });
  }
  const format = requestedFormat as ExportFormat;

  try {
    const store = await getCurrentStore();
    const [products, categories, brands, collections, families] = await Promise.all([
      fetchStoreRows<Product>("products", store.id),
      fetchStoreRows<Category>("categories", store.id),
      fetchStoreRows<Brand>("brands", store.id),
      fetchStoreRows<Collection>("collections", store.id),
      fetchStoreRows<ProductFamily>("product_families", store.id),
    ]);
    const rows = buildProductBackupRows(products, {
      categories,
      brands,
      collections,
      families,
    });
    const date = new Date().toISOString().slice(0, 10);
    const baseName = `${slugify(store.name) || "store"}-products-${date}`;

    if (format === "csv") {
      return new Response(productRowsToCsv(rows), {
        headers: downloadHeaders(`${baseName}.csv`, "text/csv; charset=utf-8"),
      });
    }

    if (format === "json") {
      return new Response(
        JSON.stringify(
          {
            schema: PRODUCT_BACKUP_SCHEMA,
            version: PRODUCT_BACKUP_VERSION,
            exported_at: new Date().toISOString(),
            store: { id: store.id, name: store.name, slug: store.slug },
            products: rows.map(structuredBackupRow),
          },
          null,
          2
        ),
        {
          headers: downloadHeaders(`${baseName}.json`, "application/json; charset=utf-8"),
        }
      );
    }

    const workbook = workbookFor(rows, store.name);
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: downloadHeaders(
        `${baseName}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ),
    });
  } catch (error) {
    console.error("Product export failed:", error);
    return NextResponse.json(
      { error: "The product backup could not be created. Please try again." },
      { status: 500 }
    );
  }
}
