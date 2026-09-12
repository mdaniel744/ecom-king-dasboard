/**
 * Read-only translation audit for the Kariv Glamour tenant.
 *
 * Usage:
 *   node scripts/audit-kariv-translations.mjs
 *   node scripts/audit-kariv-translations.mjs --output reports/kariv-translation-audit.json
 *
 * This script never mutates Supabase. It deliberately resolves the tenant
 * from its known identity and applies store_id to every catalog query.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, "..");
const EXPECTED_STORE_ID = "7efd71bc-0287-4f40-8a2f-1de330c49522";
const KARIV_DOMAIN_HINTS = new Set(["24kariv.com", "www.24kariv.com"]);
const PROTECTED_PRODUCT_IDS = new Set([
  "7375cbf5-5588-4ca9-bd16-baae4be6a0e5",
  "abb40274-aa40-44d7-93d3-6e93c552c51b",
]);
const AUDITED_FIELDS = ["name", "short_description", "description"];
const PAGE_SIZE = 500;

function loadEnv() {
  const values = { ...process.env };
  for (const filename of [".env", ".env.local"]) {
    const path = resolve(ROOT_DIR, filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!values[key]) values[key] = value;
    }
  }
  return values;
}

function parseOutputPath() {
  const index = process.argv.indexOf("--output");
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value) throw new Error("--output requires a file path.");
  return resolve(ROOT_DIR, value);
}

async function fetchAll(queryFactory) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function plainText(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GERMAN_WORDS = new Set([
  "aber", "alle", "als", "auch", "auf", "aus", "bei", "das", "dem", "den", "der", "des",
  "die", "dies", "diese", "einer", "eine", "einem", "einen", "für", "hat", "ist", "mit",
  "nicht", "oder", "sich", "sie", "und", "von", "wie", "wir", "wird", "zu", "zum", "zur",
  "uhr", "uhren", "gehäuse", "armband", "zifferblatt", "zustand", "durchmesser", "jahr",
]);
const ENGLISH_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "by", "for", "from", "has", "in", "is", "it", "its",
  "of", "on", "or", "that", "the", "this", "to", "with", "watch", "watches", "case", "dial",
  "bracelet", "condition", "diameter", "year", "features", "including", "crafted", "offers",
]);

export function detectLanguage(value) {
  const text = plainText(value).toLocaleLowerCase();
  if (!text) return { locale: "empty", confidence: 1, germanScore: 0, englishScore: 0 };

  const words = text.match(/[\p{L}]+/gu) ?? [];
  let germanScore = (text.match(/[äöüß]/g) ?? []).length * 3;
  let englishScore = 0;
  for (const word of words) {
    if (GERMAN_WORDS.has(word)) germanScore += 1;
    if (ENGLISH_WORDS.has(word)) englishScore += 1;
  }

  const top = Math.max(germanScore, englishScore);
  const difference = Math.abs(germanScore - englishScore);
  if (top < 2 || difference < 2) {
    return { locale: "ambiguous", confidence: 0, germanScore, englishScore };
  }
  return {
    locale: germanScore > englishScore ? "de" : "en",
    confidence: Math.min(1, difference / Math.max(3, top)),
    germanScore,
    englishScore,
  };
}

function normaliseForComparison(value) {
  return plainText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function classifyProduct(product, translationsByKey) {
  if (PROTECTED_PRODUCT_IDS.has(product.id)) {
    return {
      productId: product.id,
      name: product.name,
      classification: "protected_manual",
      reason: "Explicitly protected by the operator; no repair may modify this product.",
      fields: {},
    };
  }

  const combinedPrimary = AUDITED_FIELDS.map((field) => product[field]).filter(Boolean).join(" ");
  const productLanguage = detectLanguage(combinedPrimary);
  const fields = {};
  let missingGerman = 0;
  let invalidGerman = 0;

  for (const field of AUDITED_FIELDS) {
    const primary = product[field];
    const english = translationsByKey.get(`${product.id}:en:${field}`) ?? null;
    const german = translationsByKey.get(`${product.id}:de:${field}`) ?? null;
    const primaryLanguage = detectLanguage(primary);
    const englishLanguage = detectLanguage(english?.value);
    const germanLanguage = detectLanguage(german?.value);
    const sameAsGerman = Boolean(primary && german?.value) &&
      normaliseForComparison(primary) === normaliseForComparison(german.value);
    if (primary && !german?.value) missingGerman += 1;
    if (primary && german?.value && (sameAsGerman || germanLanguage.locale === "en")) invalidGerman += 1;
    fields[field] = {
      primaryPresent: Boolean(primary),
      englishPresent: Boolean(english?.value),
      englishTranslator: english?.translator ?? null,
      germanPresent: Boolean(german?.value),
      germanTranslator: german?.translator ?? null,
      primaryLanguage: primaryLanguage.locale,
      englishLanguage: englishLanguage.locale,
      germanLanguage: germanLanguage.locale,
      primaryEqualsGerman: sameAsGerman,
    };
  }

  let classification = "valid";
  let reason = "English source content and distinct German translation rows are present.";
  if (productLanguage.locale === "de") {
    classification = "source_not_english";
    reason = "Primary product content is likely German even though English is the configured source language.";
  } else if (missingGerman > 0) {
    classification = "missing_german_translation";
    reason = `${missingGerman} populated English source field(s) have no German translation row.`;
  } else if (invalidGerman > 0) {
    classification = "invalid_german_translation";
    reason = `${invalidGerman} German translation field(s) contain English or duplicate the English source.`;
  } else if (productLanguage.locale === "ambiguous") {
    classification = "ambiguous_source";
    reason = "The primary product text is too short or brand-heavy for reliable language detection.";
  }

  return {
    productId: product.id,
    name: product.name,
    classification,
    reason,
    detectedPrimaryLocale: productLanguage.locale,
    fields,
  };
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function countTranslationRows(rows) {
  return rows.reduce((counts, row) => {
    const key = `${row.locale}:${row.field_name}:${row.translator}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

async function main() {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase credentials are not configured in .env or .env.local.");
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: stores, error: storesError } = await supabase
    .from("stores")
    .select("id, name, slug, domain, google_content_language, enabled_locales, product_url_path, product_url_path_overrides, source_locale_has_prefix, updated_at")
    .or(`id.eq.${EXPECTED_STORE_ID},domain.ilike.%24kariv%,name.ilike.%kariv%`);
  if (storesError) throw new Error(`Failed to resolve Kariv tenant: ${storesError.message}`);

  const candidates = stores ?? [];
  const kariv = candidates.find((store) => store.id === EXPECTED_STORE_ID) ??
    candidates.find((store) => KARIV_DOMAIN_HINTS.has(String(store.domain ?? "").toLowerCase())) ??
    candidates.find((store) => /kariv/i.test(store.name));
  if (!kariv) throw new Error("Kariv Glamour tenant could not be resolved from the configured Supabase project.");
  if (kariv.id !== EXPECTED_STORE_ID) {
    throw new Error(`Resolved Kariv store id ${kariv.id}, expected ${EXPECTED_STORE_ID}; refusing to continue.`);
  }

  const [products, translations, allStores] = await Promise.all([
    fetchAll(() => supabase
      .from("products")
      .select("id, name, slug, short_description, description, meta_title, meta_description, dealer_user_id, status, updated_at")
      .eq("store_id", kariv.id)
      .order("id")),
    fetchAll(() => supabase
      .from("translations")
      .select("entity_id, field_name, locale, value, translator")
      .eq("store_id", kariv.id)
      .eq("entity_type", "product")
      .in("locale", ["de", "en"])
      .order("entity_id")),
    fetchAll(() => supabase
      .from("stores")
      .select("id, name, domain, google_content_language, enabled_locales")
      .neq("id", kariv.id)
      .order("name")),
  ]);

  const translationByKey = new Map(
    translations.map((row) => [`${row.entity_id}:${row.locale}:${row.field_name}`, row])
  );
  const productAudit = products.map((product) => classifyProduct(product, translationByKey));
  const orphanTranslationRows = translations.filter(
    (row) => !products.some((product) => product.id === row.entity_id)
  ).length;
  const humanTranslationRows = translations.filter((row) => row.translator === "human").length;
  const comparisonCandidates = await Promise.all(
    allStores
      .filter((store) => (store.enabled_locales ?? []).length > 0)
      .map(async (store) => {
        const [{ count: productCount }, { count: translationCount }] = await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", store.id),
          supabase.from("translations").select("entity_id", { count: "exact", head: true })
            .eq("store_id", store.id).eq("entity_type", "product"),
        ]);
        return {
          name: store.name,
          domain: store.domain,
          sourceLocale: store.google_content_language,
          enabledLocales: store.enabled_locales ?? [],
          productCount: productCount ?? 0,
          productTranslationRowCount: translationCount ?? 0,
        };
      })
  );
  const comparison = comparisonCandidates
    .filter((store) => store.productTranslationRowCount > 0)
    .sort((a, b) => b.productTranslationRowCount - a.productTranslationRowCount)[0] ?? null;

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run-read-only",
    tenant: {
      id: kariv.id,
      name: kariv.name,
      slug: kariv.slug,
      domain: kariv.domain,
      sourceLocale: kariv.google_content_language,
      enabledLocales: kariv.enabled_locales ?? [],
      productUrlPath: kariv.product_url_path,
      productUrlPathOverrides: kariv.product_url_path_overrides ?? {},
      sourceLocaleHasPrefix: kariv.source_locale_has_prefix,
    },
    protectedProductIds: [...PROTECTED_PRODUCT_IDS],
    counts: {
      products: products.length,
      dealerOwnedProducts: products.filter((product) => Boolean(product.dealer_user_id)).length,
      translationRows: translations.length,
      translationRowsByLocaleFieldAndTranslator: countTranslationRows(translations),
      humanTranslationRows,
      orphanTranslationRows,
      byClassification: countBy(productAudit, "classification"),
    },
    comparisonTenant: comparison,
    products: productAudit,
  };

  const outputPath = parseOutputPath();
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    tenant: report.tenant,
    protectedProductIds: report.protectedProductIds,
    counts: report.counts,
    comparisonTenant: report.comparisonTenant,
    outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
