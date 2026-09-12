/**
 * One-time, tenant-scoped Kariv source-language correction.
 *
 * Default is a read-only plan:
 *   node scripts/switch-kariv-source-language.mjs
 *
 * Apply creates a complete rollback snapshot before any Supabase write:
 *   node scripts/switch-kariv-source-language.mjs --apply
 *
 * Roll back with the exact backup and tenant confirmation:
 *   node scripts/switch-kariv-source-language.mjs --rollback <backup.json> \
 *     --confirm-rollback 7efd71bc-0287-4f40-8a2f-1de330c49522
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS_DIR = resolve(ROOT_DIR, "reports");
const STORE_ID = "7efd71bc-0287-4f40-8a2f-1de330c49522";
const OLD_SOURCE = "de";
const NEW_SOURCE = "en";
const FIELDS = ["name", "short_description", "description"];
const PAGE_SIZE = 500;
const PROTECTED_IDS = new Set([
  "7375cbf5-5588-4ca9-bd16-baae4be6a0e5",
  "abb40274-aa40-44d7-93d3-6e93c552c51b",
]);

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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!values[key]) values[key] = value;
    }
  }
  return values;
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) return process.argv[index + 1] ?? null;
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function comparable(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
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

function detectLanguage(value) {
  const text = plainText(value).toLocaleLowerCase();
  if (!text) return "empty";
  const words = text.match(/[\p{L}]+/gu) ?? [];
  let germanScore = (text.match(/[äöüß]/g) ?? []).length * 3;
  let englishScore = 0;
  for (const word of words) {
    if (GERMAN_WORDS.has(word)) germanScore += 1;
    if (ENGLISH_WORDS.has(word)) englishScore += 1;
  }
  if (Math.max(germanScore, englishScore) < 2 || Math.abs(germanScore - englishScore) < 2) {
    return "ambiguous";
  }
  return germanScore > englishScore ? "de" : "en";
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

async function loadSnapshot(supabase) {
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("*")
    .eq("id", STORE_ID)
    .single();
  if (storeError || !store) throw new Error(`Kariv tenant lookup failed: ${storeError?.message ?? "not found"}`);
  if (!([OLD_SOURCE, NEW_SOURCE].includes(store.google_content_language))) {
    throw new Error(`Unexpected Kariv source language: ${store.google_content_language}`);
  }

  const [products, translations] = await Promise.all([
    fetchAll(() => supabase.from("products")
      .select("id, name, short_description, description, updated_at")
      .eq("store_id", STORE_ID)
      .order("id")),
    fetchAll(() => supabase.from("translations")
      .select("store_id, entity_type, entity_id, field_name, locale, value, translator")
      .eq("store_id", STORE_ID)
      .eq("entity_type", "product")
      .order("entity_id")),
  ]);
  return { store, products, translations };
}

function createBackup(snapshot) {
  const content = {
    schema: "kariv-source-language-rollback",
    version: 1,
    createdAt: new Date().toISOString(),
    tenant: snapshot.store,
    products: snapshot.products,
    translations: snapshot.translations,
  };
  return {
    ...content,
    checksum: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
  };
}

function buildPlan(snapshot) {
  const translationByKey = new Map(
    snapshot.translations.map((row) => [`${row.entity_id}:${row.locale}:${row.field_name}`, row])
  );
  const promotions = [];
  const germanRelocations = [];
  const plannedGermanKeys = new Set(
    snapshot.translations
      .filter((row) => row.locale === OLD_SOURCE && row.value?.trim())
      .map((row) => `${row.entity_id}:${row.field_name}`)
  );

  for (const product of snapshot.products) {
    const primaryUpdate = {};
    const germanRows = [];
    const protectedProduct = PROTECTED_IDS.has(product.id);
    const primaryLanguage = detectLanguage(
      FIELDS.map((fieldName) => product[fieldName]).filter(Boolean).join(" ")
    );

    for (const fieldName of FIELDS) {
      const primary = product[fieldName];
      if (!primary?.trim()) continue;
      const english = translationByKey.get(`${product.id}:en:${fieldName}`);
      const german = translationByKey.get(`${product.id}:de:${fieldName}`);
      if (!english?.value?.trim() || comparable(primary) === comparable(english.value)) continue;

      // If the product's primary copy is German, its existing distinct English
      // row is the safest source copy: preserve German verbatim, then promote
      // English. Protected human-edited products always take this path.
      if (
        protectedProduct ||
        english.translator === "human" ||
        (primaryLanguage === OLD_SOURCE && detectLanguage(english.value) !== OLD_SOURCE)
      ) {
        primaryUpdate[fieldName] = english.value;
        const germanRow = {
          store_id: STORE_ID,
          entity_type: "product",
          entity_id: product.id,
          field_name: fieldName,
          locale: "de",
          value: primary,
          translator: protectedProduct || english.translator === "human" ? "human" : "ai",
        };
        germanRows.push(germanRow);
        plannedGermanKeys.add(`${product.id}:${fieldName}`);
      } else if (
        detectLanguage(primary) !== OLD_SOURCE &&
        detectLanguage(english.value) === OLD_SOURCE &&
        comparable(german?.value) !== comparable(english.value)
      ) {
        // Some previous de -> en jobs stored genuine German under locale=en.
        // Copy those rows to their correct locale without touching the English
        // primary content or deleting the old row during this reversible pass.
        germanRelocations.push({
          store_id: STORE_ID,
          entity_type: "product",
          entity_id: product.id,
          field_name: fieldName,
          locale: OLD_SOURCE,
          value: english.value,
          translator: english.translator ?? "ai",
        });
        plannedGermanKeys.add(`${product.id}:${fieldName}`);
      }
    }

    if (Object.keys(primaryUpdate).length > 0) {
      promotions.push({ productId: product.id, protected: protectedProduct, primaryUpdate, germanRows });
    }
  }

  const pendingGermanTranslationProducts = snapshot.products.filter((product) =>
    FIELDS.some((fieldName) =>
      product[fieldName]?.trim() && !plannedGermanKeys.has(`${product.id}:${fieldName}`)
    )
  ).map((product) => product.id);
  const protectedChecks = [...PROTECTED_IDS].map((productId) => {
    const product = snapshot.products.find((item) => item.id === productId);
    return {
      productId,
      fields: Object.fromEntries(FIELDS.filter((fieldName) => product?.[fieldName]?.trim()).map((fieldName) => {
        const english = translationByKey.get(`${productId}:en:${fieldName}`);
        const german = translationByKey.get(`${productId}:de:${fieldName}`);
        return [fieldName, {
          primaryMatchesHumanEnglish: Boolean(
            english?.translator === "human" && comparable(product?.[fieldName]) === comparable(english.value)
          ),
          hasDistinctHumanGerman: Boolean(
            german?.translator === "human" &&
            comparable(product?.[fieldName]) !== comparable(german.value)
          ),
        }];
      })),
    };
  });

  const enabledLocales = [...new Set([
    ...(snapshot.store.enabled_locales ?? []).filter((locale) => locale !== NEW_SOURCE),
    OLD_SOURCE,
  ])];
  const googlePushLocales = (snapshot.store.google_push_locales ?? []).includes(NEW_SOURCE)
    ? [...new Set([
        ...(snapshot.store.google_push_locales ?? []).filter((locale) => locale !== NEW_SOURCE),
        OLD_SOURCE,
      ])]
    : (snapshot.store.google_push_locales ?? []).filter((locale) => locale !== NEW_SOURCE);

  return {
    alreadyApplied: snapshot.store.google_content_language === NEW_SOURCE && enabledLocales.includes(OLD_SOURCE),
    storeUpdate: {
      google_content_language: NEW_SOURCE,
      enabled_locales: enabledLocales,
      google_push_locales: googlePushLocales,
    },
    promotions,
    germanRelocations,
    pendingGermanTranslationProducts,
    protectedChecks,
  };
}

async function applyPlan(supabase, snapshot, plan) {
  if (plan.alreadyApplied) {
    return { alreadyApplied: true, promotedProducts: 0, promotedFields: 0 };
  }

  // Every protected product must have its authoritative human English copy
  // available before the source language can be reversed safely.
  for (const id of PROTECTED_IDS) {
    const promotion = plan.promotions.find((item) => item.productId === id);
    if (!promotion || !("name" in promotion.primaryUpdate)) {
      throw new Error(`Protected product ${id} has no human English title; refusing to change configuration.`);
    }
  }

  let promotedFields = 0;
  for (let index = 0; index < plan.germanRelocations.length; index += 250) {
    const { error } = await supabase.from("translations").upsert(
      plan.germanRelocations.slice(index, index + 250),
      { onConflict: "entity_type,entity_id,field_name,locale" }
    );
    if (error) throw new Error(`German translation relocation failed: ${error.message}`);
  }
  for (const promotion of plan.promotions) {
    if (promotion.germanRows.length > 0) {
      const { error: translationError } = await supabase.from("translations").upsert(
        promotion.germanRows,
        { onConflict: "entity_type,entity_id,field_name,locale" }
      );
      if (translationError) throw new Error(`German preservation failed: ${translationError.message}`);
    }
    const { error: productError } = await supabase.from("products")
      .update(promotion.primaryUpdate)
      .eq("store_id", STORE_ID)
      .eq("id", promotion.productId);
    if (productError) throw new Error(`English promotion failed: ${productError.message}`);
    promotedFields += Object.keys(promotion.primaryUpdate).length;
  }

  const { error: storeError } = await supabase.from("stores")
    .update(plan.storeUpdate)
    .eq("id", STORE_ID);
  if (storeError) throw new Error(`Kariv language configuration failed: ${storeError.message}`);

  const { data: verified, error: verifyError } = await supabase.from("stores")
    .select("id, google_content_language, enabled_locales, google_push_locales")
    .eq("id", STORE_ID)
    .single();
  if (
    verifyError ||
    verified?.google_content_language !== NEW_SOURCE ||
    !(verified?.enabled_locales ?? []).includes(OLD_SOURCE)
  ) {
    throw new Error("Post-write store configuration verification failed.");
  }

  return {
    alreadyApplied: false,
    promotedProducts: plan.promotions.length,
    promotedFields,
    relocatedGermanFields: plan.germanRelocations.length,
    verified,
  };
}

async function rollback(supabase, backupPath) {
  if (option("confirm-rollback") !== STORE_ID) {
    throw new Error(`Rollback requires --confirm-rollback ${STORE_ID}`);
  }
  const backup = JSON.parse(readFileSync(resolve(ROOT_DIR, backupPath), "utf8"));
  if (backup.schema !== "kariv-source-language-rollback" || backup.tenant?.id !== STORE_ID) {
    throw new Error("This is not a valid Kariv source-language backup.");
  }
  const unsigned = { ...backup };
  delete unsigned.checksum;
  const checksum = createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
  if (checksum !== backup.checksum) throw new Error("Backup checksum verification failed.");

  for (const product of backup.products) {
    const { error } = await supabase.from("products").update({
      name: product.name,
      short_description: product.short_description,
      description: product.description,
    }).eq("store_id", STORE_ID).eq("id", product.id);
    if (error) throw new Error(`Product rollback failed for ${product.id}: ${error.message}`);
  }

  const backupRows = backup.translations.filter((row) =>
    row.entity_type === "product" && ["de", "en"].includes(row.locale) && FIELDS.includes(row.field_name)
  );
  for (let index = 0; index < backupRows.length; index += 250) {
    const { error } = await supabase.from("translations").upsert(
      backupRows.slice(index, index + 250),
      { onConflict: "entity_type,entity_id,field_name,locale" }
    );
    if (error) throw new Error(`Translation rollback failed: ${error.message}`);
  }
  const backupKeys = new Set(backupRows.map((row) => `${row.entity_id}:${row.locale}:${row.field_name}`));
  const currentRows = await fetchAll(() => supabase.from("translations")
    .select("entity_id, locale, field_name")
    .eq("store_id", STORE_ID)
    .eq("entity_type", "product")
    .in("locale", ["de", "en"])
    .in("field_name", FIELDS));
  for (const row of currentRows) {
    if (backupKeys.has(`${row.entity_id}:${row.locale}:${row.field_name}`)) continue;
    const { error } = await supabase.from("translations").delete()
      .eq("store_id", STORE_ID)
      .eq("entity_type", "product")
      .eq("entity_id", row.entity_id)
      .eq("locale", row.locale)
      .eq("field_name", row.field_name);
    if (error) throw new Error(`Translation cleanup rollback failed: ${error.message}`);
  }

  const { error: storeError } = await supabase.from("stores").update({
    google_content_language: backup.tenant.google_content_language,
    enabled_locales: backup.tenant.enabled_locales,
    google_push_locales: backup.tenant.google_push_locales,
  }).eq("id", STORE_ID);
  if (storeError) throw new Error(`Store rollback failed: ${storeError.message}`);
  console.log(JSON.stringify({ mode: "rollback", restoredProducts: backup.products.length }, null, 2));
}

async function main() {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase credentials are missing.");
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const rollbackPath = option("rollback");
  if (rollbackPath) {
    await rollback(supabase, rollbackPath);
    return;
  }

  const snapshot = await loadSnapshot(supabase);
  const plan = buildPlan(snapshot);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: hasFlag("apply") ? "apply" : "dry-run",
    tenantId: STORE_ID,
    before: {
      sourceLanguage: snapshot.store.google_content_language,
      enabledLocales: snapshot.store.enabled_locales ?? [],
      googlePushLocales: snapshot.store.google_push_locales ?? [],
      products: snapshot.products.length,
      translationRows: snapshot.translations.length,
    },
    after: plan.storeUpdate,
    alreadyApplied: plan.alreadyApplied,
    losslessPromotions: {
      products: plan.promotions.length,
      fields: plan.promotions.reduce((sum, item) => sum + Object.keys(item.primaryUpdate).length, 0),
      protectedProducts: plan.promotions.filter((item) => item.protected).length,
    },
    relocatedGermanFields: plan.germanRelocations.length,
    pendingGermanTranslationProducts: plan.pendingGermanTranslationProducts.length,
    protectedChecks: plan.protectedChecks,
  };
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = resolve(REPORTS_DIR, "kariv-source-language-switch-plan.json");
  writeJson(reportPath, report);
  if (!hasFlag("apply")) {
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    return;
  }

  const backupPath = resolve(REPORTS_DIR, `kariv-source-language-backup-${timestamp()}.json`);
  writeJson(backupPath, createBackup(snapshot));
  const result = await applyPlan(supabase, snapshot, plan);
  console.log(JSON.stringify({ ...report, result, backupPath, reportPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
