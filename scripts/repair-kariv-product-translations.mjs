/**
 * Guarded Kariv product translation repair.
 *
 * Safe defaults:
 *   node scripts/repair-kariv-product-translations.mjs
 *   node scripts/repair-kariv-product-translations.mjs --backup-only
 *
 * Applying requires the existing DeepSeek key and writes a full rollback
 * backup before touching Supabase:
 *   node scripts/repair-kariv-product-translations.mjs --apply --limit 25
 *   node scripts/repair-kariv-product-translations.mjs --apply --limit all --resume
 *
 * Rollback is intentionally explicit:
 *   node scripts/repair-kariv-product-translations.mjs --rollback <backup.json> \
 *     --confirm-rollback 7efd71bc-0287-4f40-8a2f-1de330c49522
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS_DIR = resolve(ROOT_DIR, "reports");
const STORE_ID = "7efd71bc-0287-4f40-8a2f-1de330c49522";
const SOURCE_LOCALE = "en";
const TARGET_LOCALE = "de";
const PROTECTED_IDS = new Set([
  "7375cbf5-5588-4ca9-bd16-baae4be6a0e5",
  "abb40274-aa40-44d7-93d3-6e93c552c51b",
]);
const FIELDS = ["name", "short_description", "description"];
const PAGE_SIZE = 500;
const DEFAULT_BATCH_SIZE = 5;
const MAX_CONCURRENCY = 2;
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

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

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function option(name) {
  const spaced = process.argv.indexOf(`--${name}`);
  if (spaced !== -1) return process.argv[spaced + 1] ?? null;
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : null;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

const GERMAN = new Set([
  "aber", "alle", "als", "auch", "auf", "aus", "bei", "das", "dem", "den", "der", "des",
  "die", "dies", "diese", "einer", "eine", "einem", "einen", "für", "hat", "ist", "mit",
  "nicht", "oder", "sich", "sie", "und", "von", "wie", "wir", "wird", "zu", "zum", "zur",
  "uhr", "uhren", "gehäuse", "armband", "zifferblatt", "zustand", "durchmesser", "jahr",
]);
const ENGLISH = new Set([
  "a", "an", "and", "are", "as", "at", "by", "for", "from", "has", "in", "is", "it", "its",
  "of", "on", "or", "that", "the", "this", "to", "with", "watch", "watches", "case", "dial",
  "bracelet", "condition", "diameter", "year", "features", "including", "crafted", "offers",
]);

function detectLanguage(value) {
  const text = plainText(value).toLocaleLowerCase();
  if (!text) return "empty";
  const words = text.match(/[\p{L}]+/gu) ?? [];
  let de = (text.match(/[äöüß]/g) ?? []).length * 3;
  let en = 0;
  for (const word of words) {
    if (GERMAN.has(word)) de += 1;
    if (ENGLISH.has(word)) en += 1;
  }
  if (Math.max(de, en) < 2 || Math.abs(de - en) < 2) return "ambiguous";
  return de > en ? "de" : "en";
}

function comparable(value) {
  return plainText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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

async function mapBounded(items, worker) {
  const results = [];
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, items.length) }, () => run()));
  return results;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function translate(text, sourceLocale, targetLocale, fieldName, apiKey) {
  const prompt = [
    "You are a professional translator for a luxury-watch ecommerce catalog.",
    `Translate the ${fieldName.replaceAll("_", " ")} from ${sourceLocale} to ${targetLocale}.`,
    "Do not add, remove, infer, or change factual product information.",
    "Preserve brand names, model names, reference numbers, measurements, years, condition claims, and all numbers exactly.",
    fieldName === "description"
      ? "Preserve every HTML tag, attribute, and the tag structure. Translate only visible human-readable text."
      : "Preserve the original plain-text structure.",
    "Return only the translated content with no explanation, label, quotes, or markdown fence.",
  ].join(" ");

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: text },
          ],
          temperature: 0.1,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`DeepSeek returned HTTP ${response.status}`);
      const data = await response.json();
      const result = data.choices?.[0]?.message?.content?.trim();
      if (!result) throw new Error("DeepSeek returned empty content");
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(500 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error("Translation failed");
}

async function loadCatalog(supabase) {
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name, slug, domain, google_content_language, enabled_locales, product_url_path, source_locale_has_prefix")
    .eq("id", STORE_ID)
    .single();
  if (storeError || !store) throw new Error(`Kariv tenant lookup failed: ${storeError?.message ?? "not found"}`);
  if (store.google_content_language !== SOURCE_LOCALE || !(store.enabled_locales ?? []).includes(TARGET_LOCALE)) {
    throw new Error("Kariv language configuration is not en -> de; refusing to continue.");
  }

  const [products, translations] = await Promise.all([
    fetchAll(() => supabase.from("products").select("id, name, slug, short_description, description, status, updated_at")
      .eq("store_id", STORE_ID).order("id")),
    fetchAll(() => supabase.from("translations").select("store_id, entity_type, entity_id, field_name, locale, value, translator")
      .eq("store_id", STORE_ID).eq("entity_type", "product").order("entity_id")),
  ]);
  const byKey = new Map(translations.map((row) => [`${row.entity_id}:${row.locale}:${row.field_name}`, row]));
  return { store, products, translations, byKey };
}

function planCatalog(products, byKey) {
  const decisions = [];
  for (const product of products) {
    if (PROTECTED_IDS.has(product.id)) {
      decisions.push({ productId: product.id, name: product.name, decision: "protected", jobs: [] });
      continue;
    }
    const jobs = [];
    for (const fieldName of FIELDS) {
      const primary = product[fieldName];
      if (!primary?.trim()) continue;
      const german = byKey.get(`${product.id}:de:${fieldName}`) ?? null;
      if (german?.translator === "human") continue;
      const same = Boolean(german?.value) && comparable(primary) === comparable(german.value);
      const targetLanguage = detectLanguage(german?.value);
      if (!german?.value?.trim() || same || targetLanguage === "en") {
        jobs.push({
          kind: "write_german_translation",
          cause: !german?.value?.trim()
            ? "missing_german_translation"
            : same
              ? "duplicated_english_source_in_german"
              : "english_text_in_german_translation",
          fieldName,
          sourceValue: primary,
        });
      }
    }

    decisions.push({
      productId: product.id,
      name: product.name,
      decision: jobs.length > 0 ? "translate_german" : "valid",
      jobs,
    });
  }
  return decisions;
}

function decisionCounts(decisions) {
  return decisions.reduce((counts, item) => {
    counts[item.decision] = (counts[item.decision] ?? 0) + 1;
    return counts;
  }, {});
}

function fieldPlanCounts(decisions) {
  return decisions.flatMap((decision) => decision.jobs).reduce((counts, job) => {
    counts[job.cause] = (counts[job.cause] ?? 0) + 1;
    return counts;
  }, {});
}

function makeBackup(catalog) {
  const payload = {
    schema: "kariv-product-translation-rollback",
    version: 1,
    createdAt: new Date().toISOString(),
    tenant: catalog.store,
    protectedProductIds: [...PROTECTED_IDS],
    products: catalog.products.map((product) => ({
      id: product.id,
      name: product.name,
      short_description: product.short_description,
      description: product.description,
      updated_at: product.updated_at,
    })),
    translations: catalog.translations,
  };
  return {
    ...payload,
    checksum: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

async function applyDecision(supabase, decision, apiKey) {
  const translatedJobs = await Promise.all(decision.jobs.map(async (job) => ({
    ...job,
    translated: await translate(
      job.sourceValue,
      SOURCE_LOCALE,
      TARGET_LOCALE,
      job.fieldName,
      apiKey
    ),
  })));

  const translationUpserts = [];
  for (const job of translatedJobs) {
    translationUpserts.push({
      store_id: STORE_ID,
      entity_type: "product",
      entity_id: decision.productId,
      field_name: job.fieldName,
      locale: TARGET_LOCALE,
      value: job.translated,
      translator: "ai",
    });
  }

  if (translationUpserts.length > 0) {
    const { error } = await supabase.from("translations").upsert(translationUpserts, {
      onConflict: "entity_type,entity_id,field_name,locale",
    });
    if (error) throw new Error(`Translation upsert failed: ${error.message}`);
  }
  const { data: verifyRows, error: verifyError } = await supabase.from("translations")
    .select("field_name, value").eq("store_id", STORE_ID).eq("entity_type", "product")
    .eq("entity_id", decision.productId).eq("locale", TARGET_LOCALE)
    .in("field_name", translatedJobs.map((job) => job.fieldName));
  if (verifyError) throw new Error("Post-write German translation verification failed.");
  const verified = new Map((verifyRows ?? []).map((row) => [row.field_name, row.value]));
  for (const job of translatedJobs) {
    if (verified.get(job.fieldName) !== job.translated) {
      throw new Error(`Verification mismatch for German ${job.fieldName}.`);
    }
  }
  return { productId: decision.productId, translatedFields: translatedJobs.length };
}

async function rollback(supabase, backupPath) {
  const confirm = option("confirm-rollback");
  if (confirm !== STORE_ID) throw new Error(`Rollback requires --confirm-rollback ${STORE_ID}`);
  const backup = JSON.parse(readFileSync(resolve(ROOT_DIR, backupPath), "utf8"));
  if (backup.schema !== "kariv-product-translation-rollback" || backup.tenant?.id !== STORE_ID) {
    throw new Error("This is not a valid Kariv translation rollback backup.");
  }

  const raw = { ...backup };
  delete raw.checksum;
  const checksum = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
  if (checksum !== backup.checksum) throw new Error("Backup checksum verification failed.");

  const relevantBackupRows = backup.translations.filter((row) =>
    !PROTECTED_IDS.has(row.entity_id) && ["de", "en"].includes(row.locale) && FIELDS.includes(row.field_name)
  );
  for (let index = 0; index < relevantBackupRows.length; index += 250) {
    const { error } = await supabase.from("translations").upsert(
      relevantBackupRows.slice(index, index + 250),
      { onConflict: "entity_type,entity_id,field_name,locale" }
    );
    if (error) throw new Error(`Translation rollback upsert failed: ${error.message}`);
  }

  const originalKeys = new Set(relevantBackupRows.map((row) => `${row.entity_id}:${row.locale}:${row.field_name}`));
  const currentRows = await fetchAll(() => supabase.from("translations")
    .select("entity_id, locale, field_name").eq("store_id", STORE_ID).eq("entity_type", "product")
    .in("locale", ["de", "en"]).in("field_name", FIELDS));
  for (const row of currentRows) {
    if (PROTECTED_IDS.has(row.entity_id)) continue;
    if (originalKeys.has(`${row.entity_id}:${row.locale}:${row.field_name}`)) continue;
    const { error } = await supabase.from("translations").delete()
      .eq("store_id", STORE_ID).eq("entity_type", "product").eq("entity_id", row.entity_id)
      .eq("locale", row.locale).eq("field_name", row.field_name);
    if (error) throw new Error(`Translation rollback delete failed: ${error.message}`);
  }
  console.log(JSON.stringify({ mode: "rollback", restoredTranslationRows: relevantBackupRows.length }, null, 2));
}

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });
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

  const catalog = await loadCatalog(supabase);
  const decisions = planCatalog(catalog.products, catalog.byKey);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: flag("apply") ? "apply-plan" : "dry-run",
    tenant: catalog.store,
    counts: {
      products: catalog.products.length,
      translationRows: catalog.translations.length,
      decisions: decisionCounts(decisions),
      fieldPlans: fieldPlanCounts(decisions),
      plannedFields: decisions.reduce((sum, decision) => sum + decision.jobs.length, 0),
    },
    protectedProductIds: [...PROTECTED_IDS],
    products: decisions.map((item) => ({
      productId: item.productId,
      name: item.name,
      decision: item.decision,
      fields: item.jobs.map((job) => ({ fieldName: job.fieldName, cause: job.cause })),
    })),
    review: decisions.filter((item) => item.decision === "review").map(({ productId, name }) => ({ productId, name })),
  };
  const dryRunPath = resolve(REPORTS_DIR, "kariv-translation-repair-dry-run.json");
  writeJson(dryRunPath, report);

  if (flag("backup-only")) {
    const backupPath = resolve(REPORTS_DIR, `kariv-translation-backup-${timestamp()}.json`);
    writeJson(backupPath, makeBackup(catalog));
    console.log(JSON.stringify({ ...report.counts, mode: "backup-only", backupPath }, null, 2));
    return;
  }

  if (!flag("apply")) {
    console.log(JSON.stringify({ ...report.counts, mode: "dry-run", reportPath: dryRunPath }, null, 2));
    return;
  }
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is required for --apply. No Supabase rows were changed.");
  }

  const limitValue = option("limit") ?? "25";
  const limit = limitValue === "all" ? Number.POSITIVE_INFINITY : Number.parseInt(limitValue, 10);
  if (!(limit > 0)) throw new Error("--limit must be a positive number or all.");
  const batchSize = Number.parseInt(option("batch-size") ?? String(DEFAULT_BATCH_SIZE), 10);
  if (!(batchSize > 0 && batchSize <= 25)) throw new Error("--batch-size must be between 1 and 25.");

  const checkpointPath = resolve(REPORTS_DIR, "kariv-translation-repair-checkpoint.json");
  const checkpoint = flag("resume") && existsSync(checkpointPath)
    ? JSON.parse(readFileSync(checkpointPath, "utf8"))
    : { tenantId: STORE_ID, startedAt: new Date().toISOString(), completed: [], errors: [] };
  if (checkpoint.tenantId !== STORE_ID) throw new Error("Checkpoint belongs to a different tenant.");
  const completed = new Set(checkpoint.completed.map((item) => item.productId));
  const candidates = decisions
    .filter((item) => item.jobs.length > 0 && !completed.has(item.productId))
    .slice(0, limit);

  const backupPath = resolve(REPORTS_DIR, `kariv-translation-backup-${timestamp()}.json`);
  writeJson(backupPath, makeBackup(catalog));
  checkpoint.backupPath = backupPath;
  writeJson(checkpointPath, checkpoint);

  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const outcomes = await mapBounded(batch, async (decision) => {
      try {
        return { ok: true, result: await applyDecision(supabase, decision, env.DEEPSEEK_API_KEY) };
      } catch (error) {
        return { ok: false, productId: decision.productId, error: error instanceof Error ? error.message : String(error) };
      }
    });
    for (const outcome of outcomes) {
      if (outcome.ok) checkpoint.completed.push({ ...outcome.result, completedAt: new Date().toISOString() });
      else checkpoint.errors.push({ productId: outcome.productId, error: outcome.error, failedAt: new Date().toISOString() });
    }
    writeJson(checkpointPath, checkpoint);
    console.log(`Completed ${Math.min(index + batch.length, candidates.length)}/${candidates.length}; errors ${checkpoint.errors.length}`);
    if (index + batchSize < candidates.length) await sleep(750);
  }

  console.log(JSON.stringify({
    mode: "apply",
    attemptedProducts: candidates.length,
    completedProducts: checkpoint.completed.length,
    errors: checkpoint.errors.length,
    backupPath,
    checkpointPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
