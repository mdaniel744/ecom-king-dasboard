/**
 * Safe, resumable Kariv English -> German/Czech product translation repair.
 *
 * Dry run: node scripts/repair-kariv-product-translations.mjs
 * Apply:   node scripts/repair-kariv-product-translations.mjs --apply --limit all
 * Resume:  node scripts/repair-kariv-product-translations.mjs --apply --limit all --resume
 * Restore: node scripts/repair-kariv-product-translations.mjs --rollback <backup.json> \
 *            --confirm-rollback 7efd71bc-0287-4f40-8a2f-1de330c49522
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS = resolve(ROOT, "reports");
const STORE_ID = "7efd71bc-0287-4f40-8a2f-1de330c49522";
const SOURCE_LOCALE = "en";
const TARGET_LOCALES = ["de", "cs"];
const FIELDS = ["name", "short_description", "description"];
const PAGE_SIZE = 500;
const MAX_CONCURRENCY = 2;
const API_URL = "https://api.deepseek.com/chat/completions";

const WORDS = {
  en: new Set(["a", "an", "and", "are", "as", "at", "by", "for", "from", "has", "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "with", "watch", "watches", "case", "dial", "bracelet", "condition", "diameter", "year", "white", "gold", "steel", "new", "full", "set"]),
  de: new Set(["aber", "alle", "als", "auch", "auf", "aus", "bei", "das", "dem", "den", "der", "des", "die", "eine", "einem", "einen", "für", "hat", "ist", "mit", "nicht", "oder", "sich", "und", "von", "wie", "wird", "zu", "zum", "zur", "uhr", "uhren", "gehäuse", "armband", "zifferblatt", "zustand", "jahr"]),
  cs: new Set(["a", "ale", "bez", "do", "hodinky", "je", "jsou", "k", "na", "nebo", "od", "pro", "pouzdro", "rok", "s", "se", "stav", "u", "v", "ve", "z", "ze", "zlato", "ocel", "číselník", "náramek"]),
};

function loadEnv() {
  const values = { ...process.env };
  for (const filename of [".env", ".env.local"]) {
    const path = resolve(ROOT, filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!values[key]) values[key] = value;
    }
  }
  return values;
}

function flag(name) { return process.argv.includes(`--${name}`); }
function option(name) {
  const position = process.argv.indexOf(`--${name}`);
  if (position >= 0) return process.argv[position + 1] ?? null;
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3) ?? null;
}
function stamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function plain(value) {
  return String(value ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").replace(/\s+/g, " ").trim();
}
function comparable(value) { return plain(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
function detectLanguage(value) {
  const text = plain(value).toLocaleLowerCase();
  if (!text) return "empty";
  const scores = { en: 0, de: (text.match(/[äöüß]/g) ?? []).length * 3, cs: (text.match(/[áčďéěíňóřšťúůýž]/g) ?? []).length * 3 };
  for (const word of text.match(/[\p{L}]+/gu) ?? []) {
    for (const locale of Object.keys(WORDS)) if (WORDS[locale].has(word)) scores[locale] += 1;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] < 2 || ranked[0][1] - ranked[1][1] < 2 ? "ambiguous" : ranked[0][0];
}
function hasTranslatableTitle(value) {
  return /\b(white|yellow|rose|gold|steel|new|used|unworn|excellent|condition|full set|box|papers|bracelet|dial|year)\b/i.test(plain(value));
}
function translationState(source, target, locale, fieldName) {
  if (!target?.value?.trim()) return "missing";
  if (target.translator === "human") return "human";
  const detected = detectLanguage(target.value);
  if (detected === "en" || (locale === "cs" && detected === "de")) return "invalid_language";
  if (comparable(source) === comparable(target.value) && (fieldName !== "name" || hasTranslatableTitle(source))) return "duplicated_source";
  return "valid";
}
function jobKey(job) { return `${job.productId}:${job.locale}:${job.fieldName}`; }
async function fetchAll(factory) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await factory().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
async function mapBounded(items, worker) {
  const results = [];
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, items.length) }, run));
  return results;
}
function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }

async function loadCatalog(client) {
  const { data: store, error } = await client.from("stores").select("*").eq("id", STORE_ID).single();
  if (error || !store) throw new Error(`Kariv tenant lookup failed: ${error?.message ?? "not found"}`);
  if (!/kariv/i.test(store.name ?? "") || store.google_content_language !== SOURCE_LOCALE) {
    throw new Error("The supplied tenant is not verified Kariv with English as its product source language.");
  }
  for (const locale of TARGET_LOCALES) {
    if (!(store.enabled_locales ?? []).includes(locale)) throw new Error(`Kariv target locale ${locale} is not enabled.`);
  }
  const [products, translations] = await Promise.all([
    fetchAll(() => client.from("products").select("id, name, slug, short_description, description, status, updated_at").eq("store_id", STORE_ID).order("id")),
    fetchAll(() => client.from("translations").select("store_id, entity_type, entity_id, field_name, locale, value, translator, created_at, updated_at").eq("store_id", STORE_ID).eq("entity_type", "product").in("locale", [SOURCE_LOCALE, ...TARGET_LOCALES]).in("field_name", FIELDS).order("entity_id")),
  ]);
  return { store, products, translations, byKey: new Map(translations.map((row) => [`${row.entity_id}:${row.locale}:${row.field_name}`, row])) };
}

function sourceFor(product, fieldName, byKey) {
  const primary = product[fieldName]?.trim();
  if (!primary) return { value: null, review: false, source: "empty" };
  const detected = detectLanguage(primary);
  if (detected !== "de" && detected !== "cs") return { value: primary, review: false, source: "primary" };
  // Accented French model names such as “Cintrée” and “Trésor” are factual
  // proper nouns, not Czech copy. Do not flag or rewrite them merely because
  // the lightweight detector sees accented characters.
  if (
    fieldName === "name" &&
    detected === "cs" &&
    !/\b(hodinky|pouzdro|stav|ocel|zlato|číselník|náramek)\b/i.test(primary)
  ) {
    return { value: primary, review: false, source: "primary_proper_noun" };
  }
  const savedEnglish = byKey.get(`${product.id}:en:${fieldName}`)?.value?.trim();
  if (savedEnglish && comparable(savedEnglish) !== comparable(primary) && !["de", "cs"].includes(detectLanguage(savedEnglish))) {
    return { value: savedEnglish, review: false, source: "saved_english_translation" };
  }
  return { value: primary, review: true, source: `primary_detected_${detected}` };
}

function buildPlan(catalog) {
  const jobs = [];
  const review = [];
  const states = {};
  for (const product of catalog.products) {
    for (const fieldName of FIELDS) {
      const source = sourceFor(product, fieldName, catalog.byKey);
      if (!source.value) continue;
      if (source.review) {
        review.push({ productId: product.id, name: product.name, fieldName, reason: source.source });
        continue;
      }
      for (const locale of TARGET_LOCALES) {
        const target = catalog.byKey.get(`${product.id}:${locale}:${fieldName}`) ?? null;
        const state = translationState(source.value, target, locale, fieldName);
        states[`${locale}:${state}`] = (states[`${locale}:${state}`] ?? 0) + 1;
        if (["missing", "invalid_language", "duplicated_source"].includes(state)) {
          jobs.push({ productId: product.id, productName: product.name, fieldName, locale, cause: state, sourceValue: source.value, sourceProvenance: source.source });
        }
      }
    }
  }
  return { jobs, review, states };
}

function makeBackup(catalog, plan) {
  const affected = new Set(plan.jobs.map((job) => job.productId));
  const payload = {
    schema: "kariv-product-translation-rollback", version: 2, createdAt: new Date().toISOString(),
    tenant: { id: catalog.store.id, name: catalog.store.name, sourceLocale: catalog.store.google_content_language, enabledLocales: catalog.store.enabled_locales },
    products: catalog.products.filter((product) => affected.has(product.id)).map(({ id, name, short_description, description, updated_at }) => ({ id, name, short_description, description, updated_at })),
    translations: catalog.translations.filter((row) => affected.has(row.entity_id)),
    affectedJobKeys: plan.jobs.map(jobKey),
  };
  return { ...payload, checksum: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

async function translate(job, apiKey) {
  const instructions = [
    "You are a professional translator for a luxury-watch ecommerce catalogue.",
    `Translate this ${job.fieldName.replaceAll("_", " ")} from English to ${job.locale === "de" ? "German" : "Czech"}.`,
    "Do not add, remove, infer, or change product facts.",
    "Preserve brand and model names, reference numbers, specifications, measurements, years, condition claims, punctuation, and all numbers exactly.",
    job.fieldName === "description" ? "Preserve every HTML tag, attribute, and the exact tag structure; translate only visible text." : "Preserve the plain-text structure.",
    "Return only the translation, without labels, quotes, commentary, or markdown fences.",
  ].join(" ");
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(API_URL, {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: instructions }, { role: "user", content: job.sourceValue }], temperature: 0.1 }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`DeepSeek returned HTTP ${response.status}`);
      const result = (await response.json()).choices?.[0]?.message?.content?.trim();
      if (!result) throw new Error("DeepSeek returned empty content");
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(500 * 2 ** (attempt - 1));
    } finally { clearTimeout(timeout); }
  }
  throw lastError ?? new Error("Translation failed");
}

async function applyJob(client, job, apiKey) {
  const value = await translate(job, apiKey);
  const { error } = await client.from("translations").upsert({ store_id: STORE_ID, entity_type: "product", entity_id: job.productId, field_name: job.fieldName, locale: job.locale, value, translator: "ai" }, { onConflict: "entity_type,entity_id,field_name,locale" });
  if (error) throw new Error(`Translation upsert failed: ${error.message}`);
  const { data, error: verifyError } = await client.from("translations").select("value, translator").eq("store_id", STORE_ID).eq("entity_type", "product").eq("entity_id", job.productId).eq("field_name", job.fieldName).eq("locale", job.locale).single();
  if (verifyError || data?.value !== value || data?.translator !== "ai") throw new Error("Post-write translation verification failed.");
  return { key: jobKey(job), productId: job.productId, locale: job.locale, fieldName: job.fieldName, cause: job.cause, completedAt: new Date().toISOString() };
}

async function rollback(client, path) {
  if (option("confirm-rollback") !== STORE_ID) throw new Error(`Rollback requires --confirm-rollback ${STORE_ID}`);
  const backup = JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
  const unsigned = { ...backup }; delete unsigned.checksum;
  if (backup.schema !== "kariv-product-translation-rollback" || backup.tenant?.id !== STORE_ID || createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") !== backup.checksum) throw new Error("The rollback backup is invalid or has been changed.");
  const affected = new Set(backup.products.map((product) => product.id));
  const originalKeys = new Set(backup.translations.map((row) => `${row.entity_id}:${row.locale}:${row.field_name}`));
  for (let index = 0; index < backup.translations.length; index += 250) {
    const { error } = await client.from("translations").upsert(backup.translations.slice(index, index + 250), { onConflict: "entity_type,entity_id,field_name,locale" });
    if (error) throw new Error(`Rollback upsert failed: ${error.message}`);
  }
  const current = affected.size === 0 ? [] : await fetchAll(() => client.from("translations").select("entity_id, locale, field_name").eq("store_id", STORE_ID).eq("entity_type", "product").in("entity_id", [...affected]).in("locale", [SOURCE_LOCALE, ...TARGET_LOCALES]).in("field_name", FIELDS));
  let removedNewRows = 0;
  for (const row of current) {
    if (originalKeys.has(`${row.entity_id}:${row.locale}:${row.field_name}`)) continue;
    const { error } = await client.from("translations").delete().eq("store_id", STORE_ID).eq("entity_type", "product").eq("entity_id", row.entity_id).eq("locale", row.locale).eq("field_name", row.field_name);
    if (error) throw new Error(`Rollback cleanup failed: ${error.message}`);
    removedNewRows++;
  }
  console.log(JSON.stringify({ mode: "rollback", restoredRows: backup.translations.length, removedNewRows }, null, 2));
}

function summarizeJobs(jobs) {
  const result = {};
  for (const job of jobs) result[`${job.locale}:${job.cause}`] = (result[`${job.locale}:${job.cause}`] ?? 0) + 1;
  return result;
}

async function main() {
  mkdirSync(REPORTS, { recursive: true });
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase credentials are missing.");
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  if (option("rollback")) return rollback(client, option("rollback"));

  const catalog = await loadCatalog(client);
  const plan = buildPlan(catalog);
  const report = {
    generatedAt: new Date().toISOString(), mode: flag("apply") ? "apply-plan" : "dry-run",
    tenant: { id: catalog.store.id, name: catalog.store.name, sourceLocale: SOURCE_LOCALE, targetLocales: TARGET_LOCALES },
    products: catalog.products.length, affectedProducts: new Set(plan.jobs.map((job) => job.productId)).size, plannedFields: plan.jobs.length,
    plannedByLocaleAndCause: summarizeJobs(plan.jobs), existingStates: plan.states,
    humanOrValidFieldsSkipped: Object.entries(plan.states).filter(([key]) => /:(human|valid)$/.test(key)).reduce((sum, [, count]) => sum + count, 0),
    reviewRequired: plan.review.length, review: plan.review,
  };
  const planPath = resolve(REPORTS, "kariv-translation-repair-plan.json");
  writeJson(planPath, report);
  if (flag("backup-only")) {
    const backupPath = resolve(REPORTS, `kariv-translation-backup-${stamp()}.json`);
    writeJson(backupPath, makeBackup(catalog, plan));
    return console.log(JSON.stringify({ mode: "backup-only", affectedProducts: report.affectedProducts, plannedFields: report.plannedFields, backupPath, planPath }, null, 2));
  }
  if (!flag("apply")) return console.log(JSON.stringify({ ...report, reportPath: planPath }, null, 2));
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is required. No translation rows were changed.");

  const limitText = option("limit") ?? "25";
  const limit = limitText === "all" ? Number.POSITIVE_INFINITY : Number.parseInt(limitText, 10);
  if (!(limit > 0)) throw new Error("--limit must be a positive number or all.");
  const checkpointPath = resolve(REPORTS, "kariv-translation-repair-checkpoint.json");
  const checkpoint = flag("resume") && existsSync(checkpointPath) ? JSON.parse(readFileSync(checkpointPath, "utf8")) : { tenantId: STORE_ID, startedAt: new Date().toISOString(), completed: [], failures: [] };
  if (checkpoint.tenantId !== STORE_ID) throw new Error("The checkpoint belongs to another tenant.");
  const completed = new Set(checkpoint.completed.map((item) => item.key));
  const jobs = plan.jobs.filter((job) => !completed.has(jobKey(job))).slice(0, limit);
  if (!checkpoint.backupPath) {
    checkpoint.backupPath = resolve(REPORTS, `kariv-translation-backup-${stamp()}.json`);
    writeJson(checkpoint.backupPath, makeBackup(catalog, plan));
  }
  writeJson(checkpointPath, checkpoint);

  const outcomes = await mapBounded(jobs, async (job) => {
    try { return { ok: true, value: await applyJob(client, job, env.DEEPSEEK_API_KEY) }; }
    catch (error) { return { ok: false, value: { key: jobKey(job), productId: job.productId, locale: job.locale, fieldName: job.fieldName, message: error instanceof Error ? error.message : String(error), failedAt: new Date().toISOString() } }; }
  });
  for (const outcome of outcomes) {
    checkpoint.failures = checkpoint.failures.filter((item) => item.key !== outcome.value.key);
    if (outcome.ok) checkpoint.completed.push(outcome.value); else checkpoint.failures.push(outcome.value);
    writeJson(checkpointPath, checkpoint);
  }
  console.log(JSON.stringify({ mode: "apply", attemptedFields: jobs.length, succeededThisRun: outcomes.filter((item) => item.ok).length, failuresThisRun: outcomes.filter((item) => !item.ok).length, totalCompleted: checkpoint.completed.length, outstandingFailures: checkpoint.failures.length, backupPath: checkpoint.backupPath, checkpointPath, planPath }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
