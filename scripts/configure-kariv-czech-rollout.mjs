/**
 * Tenant-scoped Kariv Czech storefront configuration.
 *
 * Dry run: node scripts/configure-kariv-czech-rollout.mjs
 * Apply:   node scripts/configure-kariv-czech-rollout.mjs --apply
 * Restore: node scripts/configure-kariv-czech-rollout.mjs --rollback <backup.json> \
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
const CONFIG_FIELDS = [
  "google_content_language",
  "enabled_locales",
  "google_feed_labels",
  "market_currencies",
  "locale_markets",
];

function envValues() {
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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!values[key]) values[key] = value;
    }
  }
  return values;
}

function option(name) {
  const position = process.argv.indexOf(`--${name}`);
  if (position >= 0) return process.argv[position + 1] ?? null;
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3) ?? null;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function signedBackup(store) {
  const payload = {
    schema: "kariv-czech-configuration-rollback",
    version: 1,
    createdAt: new Date().toISOString(),
    tenantId: STORE_ID,
    tenantName: store.name,
    settings: Object.fromEntries(CONFIG_FIELDS.map((field) => [field, store[field]])),
  };
  return {
    ...payload,
    checksum: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

function desired(store) {
  const existingLocales = (store.enabled_locales ?? []).map((locale) =>
    locale === "cz" ? "cs" : String(locale).toLowerCase()
  );
  const localeMarkets = { ...(store.locale_markets ?? {}) };
  delete localeMarkets.cz;
  return {
    google_content_language: "en",
    enabled_locales: [...new Set(existingLocales.filter((locale) => locale !== "en").concat("de", "cs"))],
    google_feed_labels: [...new Set((store.google_feed_labels ?? []).concat("DE", "CZ"))],
    market_currencies: { ...(store.market_currencies ?? {}), DE: "EUR", CZ: "CZK" },
    locale_markets: {
      ...localeMarkets,
      en: "DE",
      de: "DE",
      cs: "CZ",
    },
  };
}

async function verifiedKariv(client) {
  const { data, error } = await client.from("stores").select("*").eq("id", STORE_ID).single();
  if (error || !data) throw new Error(`Kariv tenant lookup failed: ${error?.message ?? "not found"}`);
  if (!String(data.name ?? "").toLocaleLowerCase().includes("kariv")) {
    throw new Error(`Tenant ${STORE_ID} is named “${data.name}”; refusing Kariv-only changes.`);
  }
  return data;
}

async function main() {
  const env = envValues();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase credentials are missing.");
  }
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const store = await verifiedKariv(client);
  const rollbackPath = option("rollback");

  if (rollbackPath) {
    if (option("confirm-rollback") !== STORE_ID) {
      throw new Error(`Rollback requires --confirm-rollback ${STORE_ID}`);
    }
    const backup = JSON.parse(readFileSync(resolve(ROOT, rollbackPath), "utf8"));
    const unsigned = { ...backup };
    delete unsigned.checksum;
    const checksum = createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
    if (
      backup.schema !== "kariv-czech-configuration-rollback" ||
      backup.tenantId !== STORE_ID ||
      checksum !== backup.checksum
    ) {
      throw new Error("The rollback backup is invalid or has been changed.");
    }
    const { error } = await client.from("stores").update(backup.settings).eq("id", STORE_ID);
    if (error) throw new Error(`Configuration rollback failed: ${error.message}`);
    console.log(JSON.stringify({ mode: "rollback", tenantId: STORE_ID, restored: CONFIG_FIELDS }, null, 2));
    return;
  }

  const next = desired(store);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: process.argv.includes("--apply") ? "apply" : "dry-run",
    verifiedTenant: { id: store.id, name: store.name, domain: store.domain },
    before: Object.fromEntries(CONFIG_FIELDS.map((field) => [field, store[field]])),
    after: next,
    unchangedByDesign: ["vat_rates", "google_push_locales", "product prices", "product URLs"],
  };
  writeJson(resolve(REPORTS, "kariv-czech-configuration-plan.json"), report);
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const backupPath = resolve(REPORTS, `kariv-czech-configuration-backup-${stamp()}.json`);
  writeJson(backupPath, signedBackup(store));
  const { error } = await client.from("stores").update(next).eq("id", STORE_ID);
  if (error) throw new Error(`Kariv configuration failed: ${error.message}`);
  const verified = await verifiedKariv(client);
  const mismatches = Object.entries(next).filter(([field, value]) =>
    JSON.stringify(canonical(verified[field])) !== JSON.stringify(canonical(value))
  );
  if (mismatches.length > 0) throw new Error(`Post-write verification failed for ${mismatches.map(([field]) => field).join(", ")}.`);
  console.log(JSON.stringify({ ...report, backupPath, verified: next }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
