import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { compileFunction } from "node:vm";
import ts from "typescript";
import * as apparel from "../lib/merchant-apparel.ts";

const require = createRequire(import.meta.url);
const store = { id: "00000000-0000-4000-8000-000000000001", name: "Apparel Store", domain: "store.example",
  google_merchant_id: "123", google_merchant_datasource_id: "456", google_content_language: "en",
  google_feed_label: "DE", google_feed_labels: ["DE"], enabled_locales: [], google_push_locales: [], product_url_path: "products" };
const product = { id: "00000000-0000-4000-8000-000000000002", store_id: store.id, name: "Cotton shirt", slug: "cotton-shirt",
  description: "A cotton shirt with red, green and black fabric.", price: 25, currency: "EUR", status: "active", condition: "new",
  images: ["https://store.example/shirt.jpg"], brand: "Shirt Brand", mpn: "SHIRT-1", category_id: null, family_id: null,
  attributes: { Color: "Red/Green/Black", Gender: "unisex", "Age group": "adult", Material: "Cotton", Size: "M" } };

function loadModule(path, mocks) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  compileFunction(compiled, ["require", "module", "exports", "process", "setTimeout"])((key) => {
    if (key in mocks) return mocks[key];
    if (key === "server-only") return {};
    assert.ok(!key.startsWith("@/"), `Unmocked dependency: ${key}`);
    return require(key);
  }, module, module.exports, { env: { GOOGLE_MERCHANT_SERVICE_ACCOUNT_KEY: JSON.stringify({ client_email: "test@example.com", private_key: "test-key" }) } }, (callback) => { callback(); return 0; });
  return module.exports;
}

test("color policies reject four colors, commas, empty segments, excessive lengths and hex codes", () => {
  for (const color of ["Red/Green/Black/White", "Red,Green", "Red//Black", "#ffffff", "123", "a".repeat(41), `${"a".repeat(40)}/${"b".repeat(40)}/${"c".repeat(20)}`]) {
    assert.ok(apparel.merchantApparelIssues({ Color: color }).some(issue => issue.field === "color"), color);
  }
  assert.deepEqual(apparel.merchantApparelIssues({ Color: "Red / Green / Black", Material: "Cotton/Polyester" }), []);
});

test("color is free text, including custom product colors, and adult is labeled 13+ years", () => {
  for (const color of ["Navy Blue", "Beige", "Lavender Blush", "Toasted Walnut", "Navy Blue/Gold/Ivory"]) {
    assert.deepEqual(apparel.merchantApparelIssues({ Color: color }), []);
    assert.equal(apparel.merchantApparelApiAttributes({ Color: color }).color, color);
    assert.equal(apparel.merchantApparelXml({ Color: color }), `<g:color>${color}</g:color>`);
  }
  assert.equal(apparel.MERCHANT_AGE_GROUP_OPTIONS.find(option => option.value === "adult").label, "Adult (13+ years)");
  assert.equal(apparel.merchantApparelApiAttributes({ "Age group": "adult" }).ageGroup, "ADULT");
  assert.equal(apparel.merchantApparelXml({ "Age group": "adult" }), "<g:age_group>adult</g:age_group>");
});

test("preset enum values, blanks and invalid imported demographics are handled explicitly", () => {
  for (const gender of ["male", "female", "unisex"]) for (const age_group of ["newborn", "infant", "toddler", "kids", "adult"]) {
    assert.deepEqual(apparel.merchantApparelIssues({ Gender: gender, age_group }), []);
  }
  assert.equal(apparel.merchantApparelIssues({ Gender: "unknown", "Age group": "senior" }).length, 2);
  assert.deepEqual(apparel.merchantApparelApiAttributes({}), {});
  assert.equal(apparel.merchantApparelXml({}), "");
});

test("editing or clearing an apparel field updates aliases while preserving unrelated variant attributes", () => {
  const entries = [["Size", "M"], ["Colour", "Blue"], ["color", "Black"], ["Condition", "new"]];
  const updated = apparel.updateMerchantApparel(entries, "color", "Red/Green/Black");
  assert.deepEqual(Object.fromEntries(updated), { Size: "M", Color: "Red/Green/Black", Condition: "new" });
  assert.equal(apparel.readMerchantApparel(updated).color, "Red/Green/Black");
  assert.deepEqual(Object.fromEntries(apparel.updateMerchantApparel(updated, "color", "")), { Size: "M", Condition: "new" });
  assert.equal(entries[1][1], "Blue");
});

test("text editing retains word spaces, and sync normalizes slash spacing without changing color order", () => {
  const edited = apparel.updateMerchantApparel([], "color", "Light ");
  assert.equal(apparel.readMerchantApparel(edited).color, "Light ");
  assert.equal(apparel.merchantApparelApiAttributes({ Colour: " Red / Green / Black " }).color, "Red/Green/Black");
  assert.equal(apparel.merchantApparelApiAttributes({ Gender: "Female", age_group: "KIDS" }).gender, "FEMALE");
});

test("Merchant API sync sends apparel fields with uppercase enums and each variant's own details", async () => {
  const calls = [];
  const module = loadModule("../lib/google-merchant.ts", {
    "google-auth-library": { JWT: class { async request(args) { calls.push(args); return { data: { name: "inserted" } }; } } },
    "@/lib/supabase-admin": {},
    "@/lib/merchant-rules": { checkProductForMerchant: () => [], hasBlockingIssues: () => false },
    "@/lib/html": { stripHtml: value => value },
    "@/lib/market-pricing": { convertPriceForMarket: async (amount, currency) => ({ amount, currency }) },
    "@/lib/merchant-locales": {},
    "@/lib/product-identifiers": { resolveProductMpn: p => p.mpn },
    "@/lib/merchant-apparel": apparel,
    "@/lib/merchant-translations": { selectMerchantTranslation: p => ({ name: p.name, description: p.description }), MERCHANT_TRANSLATION_FIELDS: [] },
  });
  await module.upsertGoogleProduct(store, product);
  const first = calls[0].data.productAttributes;
  assert.equal(first.color, "Red/Green/Black");
  assert.equal(first.gender, "UNISEX");
  assert.equal(first.ageGroup, "ADULT");
  assert.equal(first.material, "Cotton");
  await module.upsertGoogleProduct(store, { ...product, family_id: "family", attributes: { Colour: "Blue", Gender: "female", "Age Group": "kids", Material: "Wool" } });
  assert.equal(calls[1].data.productAttributes.color, "Blue");
  assert.equal(calls[1].data.productAttributes.gender, "FEMALE");
  assert.equal(calls[1].data.productAttributes.ageGroup, "KIDS");
  assert.equal(calls[1].data.productAttributes.itemGroupId, "family");
  await module.upsertGoogleProduct(store, { ...product, attributes: {} });
  for (const field of ["color", "gender", "ageGroup", "material"]) assert.ok(!(field in calls[2].data.productAttributes));
});

test("XML feed includes escaped apparel fields and lowercase enums from the saved product", async () => {
  const db = { from(table) {
    const query = { select() { return this; }, eq() { return this; }, not() { return this; }, order() { return this; }, range() { return this; },
      maybeSingle() { return Promise.resolve({ data: store, error: null }); },
      then(resolve) { return Promise.resolve({ data: table === "products" ? [product] : [], error: null }).then(resolve); } };
    return query;
  } };
  const feed = loadModule("../app/api/feeds/[storeId]/google.xml/route.ts", {
    "@/lib/supabase-admin": { supabaseAdmin: db },
    "@/lib/google-merchant": { buildProductLink: () => "https://store.example/products/cotton-shirt", getTranslationsByLocaleBatch: async () => new Map([[product.id, new Map([["en", { name: product.name, description: product.description }]])]]) },
    "@/lib/market-pricing": { createMarketPriceConverter: async () => ({ convert: (amount, currency) => ({ amount, currency }) }) },
    "@/lib/product-identifiers": { resolveProductMpn: p => p.mpn },
    "@/lib/merchant-translations": { MerchantTranslationError: class extends Error {} },
    "@/lib/merchant-apparel": apparel,
  });
  const response = await feed.GET(new Request(`https://store.example/api/feeds/${store.id}/google.xml`), { params: Promise.resolve({ storeId: store.id }) });
  assert.equal(response.status, 200);
  const xml = await response.text();
  for (const tag of ["<g:color>Red/Green/Black</g:color>", "<g:gender>unisex</g:gender>", "<g:age_group>adult</g:age_group>", "<g:material>Cotton</g:material>"]) assert.ok(xml.includes(tag), tag);
  assert.equal(apparel.merchantApparelXml({ Material: "Cotton & Linen" }), "<g:material>Cotton &amp; Linen</g:material>");
});

test("invalid supplied apparel details cannot reach either Google submission format", () => {
  for (const attrs of [{ Gender: "unknown" }, { "Age group": "teen" }, { Color: "Red/Green/Black/White" }, { Material: "a".repeat(201) }]) {
    assert.throws(() => apparel.merchantApparelApiAttributes(attrs), /Google apparel details/);
    assert.throws(() => apparel.merchantApparelXml(attrs), /Google apparel details/);
  }
});

function productSaveFixture() {
  const saved = [];
  const validation = loadModule("../lib/validation.ts", {});
  const actions = loadModule("../app/dashboard/products/actions.ts", {
    "next/cache": { revalidatePath() {} }, "next/server": { after() {} },
    "@/lib/get-current-store": { getCurrentStore: async () => store },
    "@/lib/supabase-admin": { supabaseAdmin: { from(table) {
      assert.equal(table, "products");
      return { insert(payload) { saved.push(payload); return this; }, select() { return this; },
        single() { return Promise.resolve({ data: { id: product.id, ...saved.at(-1) }, error: null }); } };
    } } },
    "@/lib/slug": { slugify: value => value.toLowerCase().replaceAll(" ", "-") },
    "@/lib/google-merchant": { GoogleMerchantConfigError: class extends Error {}, GoogleMerchantValidationError: class extends Error {} },
    "@/lib/merchant-rules": {}, "@/lib/merchant-locales": {}, "@/lib/market-pricing": {},
    "@/lib/validation": validation,
    "@/lib/action-result": { ok: () => ({ success: true }), toActionResult: error => ({ success: false, fieldErrors: error.fieldErrors }) },
    "@/lib/translate": { TranslationError: class extends Error {} },
    "@/lib/product-translation-workflow": { productContentValues: value => value,
      prepareProductContentForSave: async () => ({ primary: {}, incomingTranslations: [] }), saveIncomingProductTranslations: async () => {} },
    "@/lib/merchant-apparel": apparel,
  });
  return { actions, saved };
}

test("the product save persists apparel details into the existing attributes, including clear and validation", async () => {
  const { actions, saved } = productSaveFixture();
  const form = new FormData();
  form.set("name", product.name); form.set("currency", "EUR");
  form.set("google_color", "Red/Green/Black"); form.set("google_gender", "female");
  form.set("google_age_group", "kids"); form.set("google_material", "Cotton");
  form.append("attr_key", "Colour"); form.append("attr_value", "Old blue");
  form.append("attr_key", "Size"); form.append("attr_value", "M");
  assert.equal((await actions.createProduct(form)).success, true);
  assert.equal(saved[0].store_id, store.id);
  assert.deepEqual(saved[0].attributes, { Color: "Red/Green/Black", Gender: "female", "Age group": "kids", Material: "Cotton", Size: "M" });
  assert.deepEqual(apparel.readMerchantApparel(saved[0].attributes), { color: "Red/Green/Black", gender: "female", age_group: "kids", material: "Cotton" });
  form.set("google_gender", "none");
  assert.equal((await actions.createProduct(form)).success, true);
  assert.ok(!("Gender" in saved[1].attributes));
  form.set("google_color", "Red,Green");
  const failed = await actions.createProduct(form);
  assert.equal(failed.success, false);
  assert.match(failed.fieldErrors.google_color, /separated by/);
  assert.equal(saved.length, 2);
});

test("CSV and JSON backup restores preserve every apparel value and unrelated attribute", () => {
  const transfer = loadModule("../lib/product-transfer.ts", { "@/lib/slug": { slugify: value => value } });
  const source = { ...product, stock_quantity: 1, is_featured: false };
  const [row] = transfer.buildProductBackupRows([source], { categories: [], brands: [], collections: [], families: [] });
  const csvRows = transfer.parseCsvTable(transfer.productRowsToCsv([row]));
  const csvProduct = transfer.parseProductImportRow(csvRows[0]);
  const jsonProduct = transfer.parseProductImportRow({ ...row, attributes: source.attributes });
  assert.deepEqual(csvProduct.attributes, source.attributes);
  assert.deepEqual(jsonProduct.attributes, source.attributes);
});
