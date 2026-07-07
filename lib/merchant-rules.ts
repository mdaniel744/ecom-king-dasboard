import type { Product, Store } from "@/lib/types";

export type RuleSeverity = "error" | "warning";

export type RuleIssue = {
  field: string;
  code: string;
  message: string;
  severity: RuleSeverity;
};

const PROMOTIONAL_PATTERNS = [
  /free shipping/i,
  /\d+%\s*off/i,
  /\bsale\b/i,
  /best price/i,
  /\bdiscount/i,
  /buy now/i,
  /limited time/i,
  /\bguarantee/i,
  /lowest price/i,
  /clearance/i,
];

function isShoutingCaps(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 6) return false;
  return letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

function findPromotionalMatch(text: string): string | null {
  for (const pattern of PROMOTIONAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function isValidGtin(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return false;
  return [8, 12, 13, 14].includes(digits.length);
}

/**
 * Store-level setup required before ANY product from this store can sync —
 * independent of any single product's data. Checked once per store (e.g. a
 * page-level banner) rather than re-derived per product row, since the fix
 * for all of these lives in Settings, not on a product.
 */
export function checkStoreMerchantConfig(store: Store): RuleIssue[] {
  const issues: RuleIssue[] = [];

  if (!store.domain) {
    issues.push({
      field: "store",
      code: "missing_domain",
      message: "No domain set — add one in Settings to build product links.",
      severity: "error",
    });
  }

  if (!store.google_merchant_id) {
    issues.push({
      field: "store",
      code: "missing_merchant_account",
      message: "No Merchant Center account ID set — add one in Settings before syncing.",
      severity: "error",
    });
  }

  if (!store.google_merchant_datasource_id) {
    issues.push({
      field: "store",
      code: "missing_datasource",
      message: "No Merchant Center data source ID set — add one in Settings before syncing.",
      severity: "error",
    });
  }

  return issues;
}

/**
 * Pre-flight checks modeled on Google's product data specification, run
 * before a product is submitted to Merchant Center. "error" issues block
 * the sync; "warning" issues are shown but don't block, since they're
 * judgment calls Google might still accept. Includes store-level config
 * issues (see checkStoreMerchantConfig) so a single call here always
 * reflects the full truth of whether this product can sync right now.
 * https://support.google.com/merchants/answer/7052112
 */
export function checkProductForMerchant(product: Product, store: Store): RuleIssue[] {
  const storeIssues = checkStoreMerchantConfig(store);

  if (product.status !== "active") {
    return [
      ...storeIssues,
      {
        field: "status",
        code: "not_active",
        message:
          product.status === "draft"
            ? "Status is Draft — set to Active before syncing. Google only shows products that are ready to sell."
            : "Status is Archived — this product is off sale. Reactivate it to Active if you want to sync it again.",
        severity: "error",
      },
    ];
  }

  const issues: RuleIssue[] = [...storeIssues];

  if (!product.name?.trim()) {
    issues.push({
      field: "name",
      code: "missing_title",
      message: "Title is required.",
      severity: "error",
    });
  } else {
    if (product.name.length > 150) {
      issues.push({
        field: "name",
        code: "title_too_long",
        message: `Title is ${product.name.length} characters — Google's limit is 150.`,
        severity: "error",
      });
    }
    if (isShoutingCaps(product.name)) {
      issues.push({
        field: "name",
        code: "title_all_caps",
        message: "Title is in ALL CAPS — Google disapproves of this.",
        severity: "warning",
      });
    }
    const promo = findPromotionalMatch(product.name);
    if (promo) {
      issues.push({
        field: "name",
        code: "title_promotional_text",
        message: `Title contains promotional language ("${promo}") — Google often flags this in titles.`,
        severity: "warning",
      });
    }
  }

  if (!product.description?.trim()) {
    issues.push({
      field: "description",
      code: "missing_description",
      message: "No description set — Google strongly recommends one for approval and ranking.",
      severity: "warning",
    });
  } else {
    if (product.description.length > 5000) {
      issues.push({
        field: "description",
        code: "description_too_long",
        message: `Description is ${product.description.length} characters — Google's limit is 5000.`,
        severity: "error",
      });
    }
    if (isShoutingCaps(product.description)) {
      issues.push({
        field: "description",
        code: "description_all_caps",
        message: "Description is in ALL CAPS — Google disapproves of this.",
        severity: "warning",
      });
    }
    const promo = findPromotionalMatch(product.description);
    if (promo) {
      issues.push({
        field: "description",
        code: "description_promotional_text",
        message: `Description contains promotional language ("${promo}") — Google often flags this.`,
        severity: "warning",
      });
    }
  }

  if (product.price == null || product.price <= 0) {
    issues.push({
      field: "price",
      code: "missing_price",
      message: "A price greater than 0 is required.",
      severity: "error",
    });
  }

  if (!/^[A-Z]{3}$/.test(product.currency ?? "")) {
    issues.push({
      field: "currency",
      code: "invalid_currency",
      message: `Currency "${product.currency}" doesn't look like a valid 3-letter ISO code (e.g. USD, EUR).`,
      severity: "warning",
    });
  }

  if (!product.images?.length) {
    issues.push({
      field: "images",
      code: "missing_image",
      message: "At least one product image is required.",
      severity: "error",
    });
  }

  if (product.gtin) {
    if (!isValidGtin(product.gtin)) {
      issues.push({
        field: "gtin",
        code: "invalid_gtin",
        message:
          "GTIN should be 8, 12, 13, or 14 digits (UPC, EAN, JAN, ISBN-13, or ITF-14), no dashes or spaces.",
        severity: "error",
      });
    }
  } else if (!(product.brand && product.mpn)) {
    issues.push({
      field: "gtin",
      code: "no_identifier",
      message:
        "No GTIN, and no Brand+MPN pair, set — Google requires one of these, or the product must be explicitly marked as having no identifier. We'll mark it as having none, which can limit ad formats.",
      severity: "warning",
    });
  }

  return issues;
}

export function hasBlockingIssues(issues: RuleIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
