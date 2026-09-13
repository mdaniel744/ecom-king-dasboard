/**
 * Read-only Kariv Czech rollout audit.
 *
 * Verifies the tenant, product language coverage, catalogue currencies,
 * checkout currency/audit storage, rate availability, and redacted payment
 * readiness. It never mutates Supabase and never writes customer or banking
 * details into the report.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORE_ID = "7efd71bc-0287-4f40-8a2f-1de330c49522";
const SOURCE_LOCALE = "en";
const TARGET_LOCALES = ["de", "cs"];
const FIELDS = ["name", "short_description", "description"];
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
  const inline = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : null;
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

function comparable(value) {
  return plainText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const LANGUAGE_WORDS = {
  en: new Set([
    "a", "an", "and", "are", "as", "at", "by", "for", "from", "has", "in", "is", "it", "its",
    "of", "on", "or", "that", "the", "this", "to", "with", "watch", "watches", "case", "dial",
    "bracelet", "condition", "diameter", "year", "white", "gold", "steel", "new", "full", "set",
  ]),
  de: new Set([
    "aber", "alle", "als", "auch", "auf", "aus", "bei", "das", "dem", "den", "der", "des", "die",
    "eine", "einem", "einen", "für", "hat", "ist", "mit", "nicht", "oder", "sich", "und", "von", "wie",
    "wird", "zu", "zum", "zur", "uhr", "uhren", "gehäuse", "armband", "zifferblatt", "zustand", "jahr",
  ]),
  cs: new Set([
    "a", "ale", "bez", "do", "hodinky", "je", "jsou", "k", "na", "nebo", "od", "pro", "pouzdro",
    "rok", "s", "se", "stav", "u", "v", "ve", "z", "ze", "zlato", "ocel", "číselník", "náramek",
  ]),
};

function detectLanguage(value) {
  const text = plainText(value).toLocaleLowerCase();
  if (!text) return "empty";
  const words = text.match(/[\p{L}]+/gu) ?? [];
  const scores = { en: 0, de: 0, cs: 0 };
  scores.de += (text.match(/[äöüß]/g) ?? []).length * 3;
  scores.cs += (text.match(/[áčďéěíňóřšťúůýž]/g) ?? []).length * 3;
  for (const word of words) {
    for (const locale of Object.keys(LANGUAGE_WORDS)) {
      if (LANGUAGE_WORDS[locale].has(word)) scores[locale] += 1;
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] < 2 || ranked[0][1] - ranked[1][1] < 2) return "ambiguous";
  return ranked[0][0];
}

function hasTranslatableEnglishTitle(value) {
  const text = plainText(value).toLocaleLowerCase();
  return /\b(white|yellow|rose|gold|steel|new|used|unworn|excellent|condition|full set|box|papers|bracelet|dial|year)\b/.test(text);
}

function hasVisibleContent(value) {
  return plainText(value).replaceAll("\u00a0", " ").trim().length > 0;
}

function translationState(source, target, locale, fieldName) {
  if (!target?.value?.trim()) return "missing";
  if (target.translator === "human") return "human";
  const same = comparable(source) === comparable(target.value);
  const detected = detectLanguage(target.value);
  if (same && (fieldName !== "name" || hasTranslatableEnglishTitle(source))) return "invalid";
  if (fieldName !== "name" && (detected === SOURCE_LOCALE || (locale === "cs" && detected === "de"))) return "invalid";
  return "valid";
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

function countBy(items, valueFor) {
  const counts = {};
  for (const item of items) {
    const key = String(valueFor(item) ?? "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function hasConversionAudit(order) {
  const candidates = [
    order.conversion_audit,
    order.pricing_snapshot,
    order.exchange_rate,
    order.source_currency,
    order.form_data?.conversionAudit,
    order.form_data?.conversion_audit,
    order.form_data?.pricing_audit,
  ];
  return candidates.some((value) => value !== null && value !== undefined && value !== "");
}

async function optionalSingle(query) {
  const { data, error } = await query.maybeSingle();
  if (error && !["42P01", "42703"].includes(error.code)) throw new Error(error.message);
  return data ?? null;
}

async function optionalRows(query) {
  const { data, error } = await query;
  if (error && !["42P01", "42703"].includes(error.code)) throw new Error(error.message);
  return data ?? [];
}

async function main() {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase credentials are missing.");
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: store, error: storeError } = await supabase.from("stores").select("*").eq("id", STORE_ID).single();
  if (storeError || !store) throw new Error(`Kariv tenant lookup failed: ${storeError?.message ?? "not found"}`);
  if (!/kariv/i.test(store.name ?? "")) throw new Error(`Store ${STORE_ID} is not identified as Kariv; refusing to continue.`);

  const [products, translations, paymentSettings, invoiceSettings, orders, rateRows] = await Promise.all([
    fetchAll(() => supabase.from("products")
      .select("id, name, short_description, description, currency, dealer_user_id, status, updated_at")
      .eq("store_id", STORE_ID).order("id")),
    fetchAll(() => supabase.from("translations")
      .select("entity_id, field_name, locale, value, translator")
      .eq("store_id", STORE_ID).eq("entity_type", "product")
      .in("locale", [SOURCE_LOCALE, ...TARGET_LOCALES]).in("field_name", FIELDS)
      .order("entity_id")),
    optionalSingle(supabase.from("payment_settings").select("*").eq("store_id", STORE_ID)),
    optionalSingle(supabase.from("invoice_settings").select("*").eq("store_id", STORE_ID)),
    optionalRows(supabase.from("checkout_orders").select("*").eq("store_id", STORE_ID).limit(1000)),
    optionalRows(supabase.from("exchange_rate_cache").select("currency, rate, observed_at, fetched_at").in("currency", ["EUR", "CZK"])),
  ]);

  const byKey = new Map(
    translations.map((row) => [`${row.entity_id}:${row.locale}:${row.field_name}`, row])
  );
  const coverage = {};
  const affectedProductIds = {};
  for (const locale of TARGET_LOCALES) {
    const states = [];
    const affected = new Set();
    for (const product of products) {
      for (const fieldName of FIELDS) {
        const source = product[fieldName];
        if (!source?.trim() || !hasVisibleContent(source)) continue;
        const state = translationState(
          source,
          byKey.get(`${product.id}:${locale}:${fieldName}`),
          locale,
          fieldName
        );
        states.push({ productId: product.id, fieldName, state });
        if (state === "missing" || state === "invalid") affected.add(product.id);
      }
    }
    coverage[locale] = {
      productsAffected: affected.size,
      fields: countBy(states, (item) => item.state),
    };
    affectedProductIds[locale] = [...affected];
  }

  const sourceReview = products.filter((product) => {
    const locale = detectLanguage(FIELDS.map((fieldName) => product[fieldName]).filter(Boolean).join(" "));
    return locale === "de" || locale === "cs" || locale === "ambiguous";
  });
  const checkoutColumns = [...new Set(orders.flatMap((order) => Object.keys(order)))].sort();
  const supportedCurrencies = paymentSettings?.bank_supported_currencies ??
    (paymentSettings?.bank_currency ? [paymentSettings.bank_currency] : []);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "read-only",
    tenant: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      domain: store.domain,
      sourceLocale: store.google_content_language,
      enabledLocales: store.enabled_locales ?? [],
      deliveryMarkets: store.google_feed_labels ?? [store.google_feed_label],
      marketCurrencies: store.market_currencies ?? {},
      localeMarkets: store.locale_markets ?? {},
      vatRates: store.vat_rates ?? {},
    },
    catalogue: {
      products: products.length,
      activeProducts: products.filter((product) => product.status === "active").length,
      dealerOwnedProducts: products.filter((product) => Boolean(product.dealer_user_id)).length,
      sourceCurrencyCounts: countBy(products, (product) => product.currency),
      sourceLanguageReviewProducts: sourceReview.length,
      coverage,
      translationRows: translations.length,
      translationRowsByLocaleAndProvenance: countBy(
        translations,
        (row) => `${row.locale}:${row.translator}`
      ),
    },
    payments: {
      settingsRowExists: Boolean(paymentSettings),
      bankTransferEnabled: Boolean(paymentSettings?.bank_transfer_enabled),
      beneficiaryConfigured: Boolean(
        paymentSettings?.bank_name && paymentSettings?.bank_account_name &&
        (paymentSettings?.bank_account_number || paymentSettings?.bank_iban)
      ),
      bankCountryConfigured: Boolean(paymentSettings?.bank_country),
      bankCurrency: paymentSettings?.bank_currency ?? null,
      declaredSupportedCurrencies: supportedCurrencies,
      czkAcceptanceVerifiedInSettings: supportedCurrencies.includes("CZK"),
      invoiceSettingsRowExists: Boolean(invoiceSettings),
    },
    orders: {
      total: orders.length,
      currencyCounts: countBy(orders, (order) => order.currency),
      nonEurOrders: orders.filter((order) => order.currency !== "EUR").length,
      nonEurOrdersWithConversionAudit: orders.filter(
        (order) => order.currency !== "EUR" && hasConversionAudit(order)
      ).length,
      detectedColumns: checkoutColumns,
    },
    rates: rateRows.map((row) => ({
      currency: row.currency,
      observedAt: row.observed_at,
      fetchedAt: row.fetched_at,
      available: Number(row.rate) > 0,
    })),
    environment: {
      translationProviderConfigured: Boolean(env.DEEPSEEK_API_KEY),
    },
    affectedProductIds,
  };

  const output = option("output");
  if (output) {
    const path = resolve(ROOT_DIR, output);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify({
    tenant: report.tenant,
    catalogue: { ...report.catalogue, affectedProductIds: undefined },
    payments: report.payments,
    orders: report.orders,
    rates: report.rates,
    environment: report.environment,
    output: output ? resolve(ROOT_DIR, output) : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
