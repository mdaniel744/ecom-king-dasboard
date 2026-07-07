import "server-only";
import { JWT } from "google-auth-library";
import type { Product, ProductCondition, Store } from "@/lib/types";
import { checkProductForMerchant, hasBlockingIssues } from "@/lib/merchant-rules";

const MERCHANT_API_BASE = "https://merchantapi.googleapis.com/products/v1";

const CONDITION_MAP: Record<ProductCondition, string> = {
  new: "NEW",
  used: "USED",
  refurbished: "REFURBISHED",
};

export class GoogleMerchantConfigError extends Error {}
export class GoogleMerchantValidationError extends Error {}

function getAccountId(store: Store): string {
  if (!store.google_merchant_id) {
    throw new GoogleMerchantConfigError(
      "This store has no Merchant Center ID set. Add it in Settings before syncing to Google."
    );
  }
  return store.google_merchant_id;
}

function getDataSourceName(store: Store, accountId: string): string {
  if (!store.google_merchant_datasource_id) {
    throw new GoogleMerchantConfigError(
      "This store has no Merchant Center data source ID set. Add it in Settings before syncing to Google."
    );
  }
  return `accounts/${accountId}/dataSources/${store.google_merchant_datasource_id}`;
}

function getServiceAccountCredentials(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new GoogleMerchantConfigError(
      "GOOGLE_MERCHANT_SERVICE_ACCOUNT_KEY is not set. Add the service account JSON key to .env."
    );
  }

  try {
    // Accept either raw JSON or base64-encoded JSON (base64 is safer for hosting env vars)
    const decoded = raw.trimStart().startsWith("{")
      ? raw
      : Buffer.from(raw.trim(), "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("missing client_email or private_key");
    }
    return parsed;
  } catch {
    throw new GoogleMerchantConfigError(
      "GOOGLE_MERCHANT_SERVICE_ACCOUNT_KEY is not valid JSON for a Google service account key."
    );
  }
}

let cachedClient: JWT | null = null;

function getAuthClient(): JWT {
  if (cachedClient) return cachedClient;

  const credentials = getServiceAccountCredentials();
  cachedClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/content"],
  });
  return cachedClient;
}

function buildProductLink(store: Store, product: Product): string {
  const base = store.domain!.startsWith("http") ? store.domain! : `https://${store.domain}`;
  return `${base.replace(/\/$/, "")}/products/${product.slug}`;
}

function buildProductInput(store: Store, product: Product, productType?: string | null) {
  const issues = checkProductForMerchant(product, store);
  if (hasBlockingIssues(issues)) {
    const summary = issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message)
      .join(" ");
    throw new GoogleMerchantValidationError(summary);
  }

  // Google's actual rule: a valid identifier is a GTIN, or brand+MPN
  // together. Brand alone is not sufficient (real-world feeds we compared
  // against use brand+MPN with no GTIN at all, which is what this matches).
  const hasIdentifier = Boolean(product.gtin || (product.brand && product.mpn));

  return {
    offerId: product.id,
    contentLanguage: store.google_content_language,
    feedLabel: store.google_feed_label,
    productAttributes: {
      title: product.name,
      description: product.description ?? product.name,
      link: buildProductLink(store, product),
      imageLink: product.images[0],
      additionalImageLinks: product.images.slice(1, 10),
      availability: product.status === "active" ? "IN_STOCK" : "OUT_OF_STOCK",
      condition: CONDITION_MAP[product.condition],
      price: {
        amountMicros: String(Math.round(product.price! * 1_000_000)),
        currencyCode: product.currency,
      },
      salePrice: product.sale_price
        ? {
            amountMicros: String(Math.round(product.sale_price * 1_000_000)),
            currencyCode: product.currency,
          }
        : undefined,
      brand: product.brand ?? undefined,
      gtins: product.gtin ? [product.gtin] : undefined,
      mpn: product.mpn ?? undefined,
      googleProductCategory: product.google_product_category ?? undefined,
      productTypes: productType ? [productType] : undefined,
      // Per Google's spec: explicitly declare no identifier rather than
      // silently omitting gtin/brand/mpn, which otherwise risks disapproval
      // for "missing identifier" on products that legitimately have none.
      identifierExists: hasIdentifier ? undefined : false,
    },
  };
}

/**
 * Upserts a product into Google Merchant Center. productInputs.insert is an
 * upsert keyed by (contentLanguage, feedLabel, offerId), so create and
 * update use the same call. `productType` is an optional free-text
 * breadcrumb (e.g. "Containers > Open Side") built from the product's
 * category — resolved by the caller, since this module has no DB access.
 */
export async function upsertGoogleProduct(
  store: Store,
  product: Product,
  productType?: string | null
) {
  const accountId = getAccountId(store);
  const dataSource = getDataSourceName(store, accountId);
  const body = buildProductInput(store, product, productType);
  const client = getAuthClient();

  const res = await client.request({
    url: `${MERCHANT_API_BASE}/accounts/${accountId}/productInputs:insert?dataSource=${encodeURIComponent(dataSource)}`,
    method: "POST",
    data: body,
    timeout: 25000,
  });

  return res.data as { name: string };
}

export async function deleteGoogleProduct(store: Store, productId: string) {
  const accountId = getAccountId(store);
  const dataSource = getDataSourceName(store, accountId);
  const client = getAuthClient();

  const productInputName = `${store.google_content_language}~${store.google_feed_label}~${productId}`;

  await client.request({
    url: `${MERCHANT_API_BASE}/accounts/${accountId}/productInputs/${productInputName}?dataSource=${encodeURIComponent(dataSource)}`,
    method: "DELETE",
    timeout: 25000,
  });
}
