// Read-only audit of Kariv's public Merchant feeds and saved translations.
import { createClient } from "@supabase/supabase-js";
import { KARIV_GLAMOUR_STORE_ID } from "../lib/tenant-ids.js";
import { stripHtml } from "../lib/html.ts";

process.loadEnvFile(".env.local");
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const storeId = KARIV_GLAMOUR_STORE_ID;
const base = process.argv.find((arg) => arg.startsWith("--base="))?.slice(7) || "https://mycontainergmbh.com";
const fields = ["name", "description", "google_title", "google_description", "slug"];

async function allRows(factory) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await factory().range(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
function plain(value) {
  return stripHtml(String(value ?? "")).replace(/\s+/g, " ").trim();
}
function xmlField(item, field) {
  const raw = item.match(new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`))?.[1] || "";
  return raw.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").replace(/&amp;/g, "&");
}

const { data: store, error } = await client.from("stores")
  .select("id,name,domain,google_content_language,enabled_locales,google_push_locales,google_feed_labels,product_url_path,product_url_path_overrides,source_locale_has_prefix")
  .eq("id", storeId).single();
if (error) throw new Error(error.message);
const [products, translations] = await Promise.all([
  allRows(() => client.from("products").select("id,name,description,google_title,google_description,slug,images")
    .eq("store_id", storeId).eq("status", "active").not("price", "is", null).order("id")),
  allRows(() => client.from("translations").select("entity_id,locale,field_name,value")
    .eq("store_id", storeId).eq("entity_type", "product").in("locale", ["de", "cs"]).in("field_name", fields).order("id")),
]);
const eligible = products.filter((product) => product.images?.length);
const byId = new Map(eligible.map((product) => [product.id, product]));
const byTranslation = new Map(translations.map((row) => [`${row.entity_id}:${row.locale}:${row.field_name}`, row.value]));
console.log(JSON.stringify({ store, eligibleProducts: eligible.length, translationRows: translations.length }));

// Reproduce the current single-query loader, recording only counts/errors.
if (process.argv.includes("--reproduce-old-query")) {
  const old = await client.from("translations").select("entity_id,locale,field_name,value")
    .eq("store_id", storeId).eq("entity_type", "product").in("entity_id", eligible.map((product) => product.id));
  console.log(JSON.stringify({ oldLoader: { status: old.status, returnedRows: old.data?.length, error: old.error?.message?.slice(0, 160) } }));
}

for (const [locale, market] of [["de", "DE"], ["cs", "CZ"]]) {
  let missingName = 0, missingDescription = 0, missingOverrideOnly = 0, copiedEnglishDescriptions = 0;
  const get = (product, field) => byTranslation.get(`${product.id}:${locale}:${field}`);
  for (const product of eligible) {
    if (!plain(get(product, "name"))) missingName++;
    if (!plain(get(product, "description"))) missingDescription++;
    if (product.google_description && !plain(get(product, "google_description"))) missingOverrideOnly++;
    if (plain(get(product, "description")) && plain(get(product, "description")) === plain(product.description)) copiedEnglishDescriptions++;
  }
  if (process.argv.includes("--details")) {
    console.log(JSON.stringify({ locale, gaps: eligible.filter((product) => !plain(get(product, "description")) || plain(get(product, "description")) === plain(product.description)).map((product) => ({
      id: product.id, name: product.name, source: plain(product.description).slice(0, 160), translated: plain(get(product, "description")).slice(0, 160), override: plain(product.google_description).slice(0, 100),
    })) }));
  }
  const started = Date.now();
  const response = await fetch(`${base}/api/feeds/${storeId}/google.xml?market=${market}&locale=${locale}`, { signal: AbortSignal.timeout(90000) });
  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  let sourceDescriptions = 0, sourceTitles = 0, localizedDescriptions = 0;
  const mismatches = [];
  const seen = new Set();
  for (const item of items) {
    const id = xmlField(item, "g:id");
    const product = byId.get(id);
    if (!product || seen.has(id)) {
      mismatches.push({ id, reason: product ? "duplicate product" : "unexpected product" });
      continue;
    }
    seen.add(id);
    if (plain(xmlField(item, "g:description")) === plain(product.google_description || product.description || product.name)) sourceDescriptions++;
    if (xmlField(item, "g:title") === (product.google_title || product.name)) sourceTitles++;
    const title = (plain(product.google_title) ? plain(get(product, "google_title")) : "") || plain(get(product, "name"));
    const description = (plain(product.google_description) ? plain(get(product, "google_description")) : "") || plain(get(product, "description"));
    if (plain(xmlField(item, "g:description")) === plain(description)) localizedDescriptions++;
    const expectedDescription = description || (!plain(product.description) && !plain(product.google_description) ? title : "");
    if (!title || plain(xmlField(item, "g:title")) !== title || !expectedDescription || plain(xmlField(item, "g:description")) !== expectedDescription) {
      mismatches.push({ id, reason: "title or description differs from saved target-language content" });
    }
  }
  const passed = response.ok && seen.size === eligible.length && mismatches.length === 0 && response.headers.get("content-language") === locale;
  console.log(JSON.stringify({ locale, market, missingName, missingDescription, missingOverrideOnly, copiedEnglishDescriptions,
    feed: { status: response.status, items: items.length, sourceDescriptions, sourceTitles, localizedDescriptions,
      verificationPassed: passed, mismatches, elapsedMs: Date.now() - started,
      contentLanguage: response.headers.get("content-language"), cacheControl: response.headers.get("cache-control"),
      sample: items.length ? { title: xmlField(items[0], "g:title"), description: plain(xmlField(items[0], "g:description")).slice(0, 400), link: xmlField(items[0], "link") } : xml.slice(0, 300) }
  }));
  if (process.argv.includes("--verify") && !passed) process.exitCode = 1;
}
