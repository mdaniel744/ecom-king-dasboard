/**
 * One-time migration: pulls Kariv Glamour's real Brands, Collections,
 * Products, and FAQ from Base44's public API and inserts them into this
 * store's rows in Supabase. Source language is German (de) — every
 * *_de field (or the bare field if no _de variant exists) is the value
 * written to the primary column; English translations are generated via
 * DeepSeek afterward, same as any other store's translation pipeline.
 *
 * Usage: node scripts/migrate-kariv-base44.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_ID = "7efd71bc-0287-4f40-8a2f-1de330c49522";
const APP_ID = "6a3f1710b5d8247379a67f8a";
const SOURCE_LOCALE = "de";
const TARGET_LOCALES = ["en"];

// ── Env ──────────────────────────────────────────────────────────────────
const envPath = join(__dirname, "../.env");
const envContent = readFileSync(envPath, "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY;

// ── Base44 fetch ─────────────────────────────────────────────────────────
async function fetchEntity(name) {
  const res = await fetch(`https://base44.app/api/apps/${APP_ID}/entities/${name}`, {
    headers: { "X-App-Id": APP_ID },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${name}: ${res.status}`);
  return res.json();
}

// ── Helpers ──────────────────────────────────────────────────────────────
function de(row, field) {
  return row[`${field}_de`] || row[field] || null;
}

function slugify(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

async function translateText(text, fieldRole) {
  if (!text || !text.trim()) return "";
  const systemPrompt = [
    `You are a professional e-commerce translator.`,
    `Translate the user's text from "de" to "en".`,
    `This text is a "${fieldRole}" on a luxury watch marketplace.`,
    `Keep tone and length appropriate for e-commerce. Preserve any numbers, units, and proper nouns exactly.`,
    `Return ONLY the translated text — no quotes, no explanation, no original text.`,
  ].join(" ");

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function insertTranslation(entityType, entityId, fieldName, locale, value) {
  if (!value) return;
  await supabase.from("translations").upsert(
    { store_id: STORE_ID, entity_type: entityType, entity_id: entityId, field_name: fieldName, locale, value, translator: "ai" },
    { onConflict: "entity_type,entity_id,field_name,locale" }
  );
}

async function translateAndStore(entityType, entityId, fields) {
  for (const locale of TARGET_LOCALES) {
    for (const [fieldName, value] of Object.entries(fields)) {
      if (!value) continue;
      const translated = await translateText(value, fieldName);
      await insertTranslation(entityType, entityId, fieldName, locale, translated);
    }
  }
}

const CONDITION_MAP = {
  New: "new", Unworn: "new",
  Excellent: "used", "Very Good": "used", Good: "used", Vintage: "used",
};

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("Fetching Base44 data...");
  const [brands, collections, products, faqs] = await Promise.all([
    fetchEntity("Brands"),
    fetchEntity("Collections"),
    fetchEntity("Products"),
    fetchEntity("FAQ"),
  ]);
  console.log(`Brands: ${brands.length}, Collections: ${collections.length}, Products: ${products.length}, FAQ: ${faqs.length}`);

  // Fetch existing attribute defs so we can map values to attribute names
  const { data: attrs } = await supabase.from("attributes").select("id, name").eq("store_id", STORE_ID);
  const attrIdByName = new Map(attrs.map((a) => [a.name, a.id]));

  // ── 1. Brands ────────────────────────────────────────────────────────
  console.log("\n--- Migrating Brands ---");
  const brandSlugToId = new Map();
  const brandNameToId = new Map();
  for (const b of brands) {
    const name = de(b, "brandName");
    const slug = b.slug || slugify(name);
    const { data, error } = await supabase
      .from("brands")
      .insert({
        store_id: STORE_ID,
        name,
        slug,
        short_description: de(b, "shortDescription"),
        long_description: de(b, "longDescription"),
        disclaimer: de(b, "brandDisclaimer"),
        meta_title: de(b, "seoTitle"),
        meta_description: de(b, "seoDescription"),
        logo_light_url: b.brandLogoLight || null,
        logo_dark_url: b.brandLogoDark || null,
        hero_image_url: b.heroImage || null,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  FAILED brand "${name}":`, error.message);
      continue;
    }
    brandSlugToId.set(slug, data.id);
    brandNameToId.set(name, data.id);
    console.log(`  ✓ ${name}`);
    await translateAndStore("brand", data.id, {
      name,
      short_description: de(b, "shortDescription"),
      long_description: de(b, "longDescription"),
      disclaimer: de(b, "brandDisclaimer"),
      meta_title: de(b, "seoTitle"),
      meta_description: de(b, "seoDescription"),
    });
  }

  // ── 2. Collections ───────────────────────────────────────────────────
  console.log("\n--- Migrating Collections ---");
  const collectionSlugToId = new Map();
  for (const c of collections) {
    const name = de(c, "collectionName");
    const slug = c.slug || slugify(name);
    // Base44's `brand` field on Collections is the brand's slug
    const brandId = brandSlugToId.get(c.brand) || brandNameToId.get(c.brand);
    if (!brandId) {
      console.warn(`  SKIPPED collection "${name}" — no matching brand for "${c.brand}"`);
      continue;
    }
    const { data, error } = await supabase
      .from("collections")
      .insert({
        store_id: STORE_ID,
        brand_id: brandId,
        name,
        slug,
        description: de(c, "description"),
        image_url: c.heroImage || null,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  FAILED collection "${name}":`, error.message);
      continue;
    }
    collectionSlugToId.set(slug, data.id);
    console.log(`  ✓ ${name} (${c.brand})`);
    await translateAndStore("collection", data.id, {
      name,
      description: de(c, "description"),
    });
  }

  // ── 3. Products ──────────────────────────────────────────────────────
  console.log("\n--- Migrating Products ---");
  for (const p of products) {
    const name = de(p, "productTitle");
    if (!name) {
      console.warn(`  SKIPPED product ${p.id} — no title`);
      continue;
    }
    const slug = p.slug || slugify(name);
    const brandId = brandNameToId.get(p.brand) || null;
    const collectionSlug = p.collection ? slugify(p.collection) : null;
    const collectionId = collectionSlug ? collectionSlugToId.get(collectionSlug) || null : null;

    const images = [];
    if (p.featuredImage) images.push(p.featuredImage);
    for (const img of p.productImages || []) {
      if (img && !images.includes(img)) images.push(img);
    }

    const attributes = {};
    function setAttr(attrName, value) {
      if (value === null || value === undefined || value === "") return;
      if (!attrIdByName.has(attrName)) return;
      attributes[attrName] = String(value);
    }
    setAttr("Condition", p.condition);
    setAttr("Gender", p.gender);
    setAttr("Movement Type", p.movementType);
    setAttr("Watch Shape", p.watchShape);
    setAttr("Case Material", p.caseMaterial);
    setAttr("Dial Color", p.dialColor);
    setAttr("Authentication", p.authenticationStatus);
    setAttr("Bracelet Material", p.braceletMaterial);
    setAttr("Crystal Type", p.crystalType);
    setAttr("Warranty Type", de(p, "warrantyType"));
    setAttr("Case Diameter", p.caseDiameter);
    setAttr("Water Resistance", p.waterResistance);
    setAttr("Power Reserve", p.powerReserve);
    setAttr("Warranty Duration", p.warrantyDuration);
    setAttr("Year of Production", p.yearOfProduction);
    setAttr("Functions", de(p, "functions"));
    setAttr("Scope of Delivery", de(p, "scopeOfDelivery"));
    setAttr("Service History", de(p, "serviceHistory"));
    setAttr("Polished Status", de(p, "polishedStatus"));
    setAttr("Original Parts Status", de(p, "originalPartsStatus"));
    setAttr("New Arrival", p.isNewArrival ? "Yes" : "No");
    setAttr("Certified Pre-Owned", p.isCertifiedPreOwned ? "Yes" : "No");
    setAttr("Vintage", p.isVintage ? "Yes" : "No");
    setAttr("Box Included", p.boxIncluded ? "Yes" : "No");
    setAttr("Papers Included", p.papersIncluded ? "Yes" : "No");
    setAttr("Availability", p.availability);

    const { data, error } = await supabase
      .from("products")
      .insert({
        store_id: STORE_ID,
        name,
        slug,
        short_description: de(p, "shortDescription"),
        description: de(p, "productDescription"),
        price: p.price ?? null,
        sale_price: p.salePrice ?? null,
        currency: p.currency || "EUR",
        sku: p.sku || null,
        reference_number: p.referenceNumber || null,
        stock_quantity: p.stockQuantity ?? 0,
        status: p.isPublished ? "active" : "draft",
        condition: CONDITION_MAP[p.condition] || "used",
        images,
        image_alts: [],
        attributes,
        brand: p.brand || null,
        brand_id: brandId,
        collection_id: collectionId,
        is_featured: Boolean(p.featured),
        google_title: de(p, "googleMerchantTitle"),
        google_description: de(p, "googleMerchantDescription"),
        google_product_category: null,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`  FAILED product "${name}":`, error.message);
      continue;
    }
    console.log(`  ✓ ${name}`);
    await translateAndStore("product", data.id, {
      name,
      short_description: de(p, "shortDescription"),
      description: de(p, "productDescription"),
    });
  }

  // ── 4. FAQ ───────────────────────────────────────────────────────────
  console.log("\n--- Migrating FAQ ---");
  for (const f of faqs) {
    const question = de(f, "question");
    const answer = de(f, "answer");
    const { data, error } = await supabase
      .from("faqs")
      .insert({ store_id: STORE_ID, question, answer, category: f.category || null })
      .select("id")
      .single();
    if (error) {
      console.error(`  FAILED faq "${question}":`, error.message);
      continue;
    }
    console.log(`  ✓ ${question}`);
    await translateAndStore("faq", data.id, { question, answer });
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
