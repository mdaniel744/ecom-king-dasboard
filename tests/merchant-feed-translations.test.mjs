import test from "node:test";
import assert from "node:assert/strict";
import {
  loadMerchantTranslationRows,
  selectMerchantTranslation,
  MerchantTranslationError,
} from "../lib/merchant-translations.ts";

test("a Kariv-sized catalogue loads every language beyond the database row cap using short requests", async () => {
  const ids = Array.from({ length: 733 }, (_, index) => `product-${index}`);
  const rows = ids.flatMap((entity_id) => ["de", "cs", "fr", "nl"].flatMap((locale) =>
    ["name", "description", "short_description", "google_title", "google_description", "slug"]
      .map((field_name) => ({ entity_id, locale, field_name, value: `${entity_id}-${locale}-${field_name}` }))));
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const loaded = await loadMerchantTranslationRows(ids, async (requested, from, to) => {
    assert.ok(requested.length <= 50, "oversized IN filters fail in production");
    assert.ok(to - from < 1000, "respect the database row cap");
    calls++;
    maxActive = Math.max(maxActive, ++active);
    await Promise.resolve();
    const matches = rows.filter((row) => requested.includes(row.entity_id));
    active--;
    return { data: matches.slice(from, to + 1), error: null };
  });
  assert.equal(loaded.length, rows.length);
  assert.equal(new Set(loaded.map((row) => row.value)).size, rows.length);
  assert.ok(calls > Math.ceil(ids.length / 50), "large translation batches require several pages");
  assert.ok(maxActive <= 3);
  assert.ok(loaded.some((row) => row.entity_id === "product-732" && row.locale === "cs"));
});

test("a failed later page aborts the load instead of returning partial data or falling back to English", async () => {
  await assert.rejects(loadMerchantTranslationRows(["product"], async (_ids, from) =>
    from === 0
      ? { data: Array.from({ length: 500 }, () => ({ entity_id: "product", locale: "de", field_name: "name", value: "Uhr" })), error: null }
      : { data: null, error: { message: "Database unavailable" } }
  ), MerchantTranslationError);
});

test("empty catalogues do not query translations", async () => {
  assert.deepEqual(await loadMerchantTranslationRows([], async () => { throw new Error("Unexpected query"); }), []);
});

const product = {
  name: "Steel watch", description: "An automatic watch with a blue dial.",
  short_description: "English summary", slug: "steel-watch", google_title: null, google_description: null,
};
const fields = (name, description, extra = []) => new Map([["name", name], ["description", description], ...extra]);

test("German and Czech content are selected independently with localized URLs", () => {
  const de = selectMerchantTranslation(product, "en", "de", fields("Stahluhr", "Eine Automatikuhr mit blauem Zifferblatt.", [["slug", "stahluhr"]]));
  const cs = selectMerchantTranslation(product, "en", "cs", fields("Ocelové hodinky", "Automatické hodinky s modrým číselníkem.", [["slug", "ocelove-hodinky"]]));
  assert.equal(de.name, "Stahluhr");
  assert.equal(cs.description, "Automatické hodinky s modrým číselníkem.");
  assert.equal(de.slug, "stahluhr");
  assert.equal(cs.slug, "ocelove-hodinky");
  assert.equal(cs.short_description, null, "an English optional field must not leak into Czech");
});

test("missing, blank, or partial translations cannot masquerade as complete localized text", () => {
  for (const rows of [new Map(), fields("Stahluhr", ""), fields("", "Eine Uhr."), new Map([["slug", "stahluhr"]])]) {
    assert.equal(selectMerchantTranslation(product, "en", "de", rows), null);
  }
});

test("untranslated Google overrides use translated main content, never the English override", () => {
  const overridden = { ...product, google_title: "English Google title", google_description: "English Google description" };
  const rows = fields("Stahluhr", "Eine Automatikuhr.");
  assert.equal(selectMerchantTranslation(overridden, "en", "de", rows).description, "Eine Automatikuhr.");
  rows.set("google_title", "Google-Titel");
  rows.set("google_description", "Google-Beschreibung");
  assert.equal(selectMerchantTranslation(overridden, "en", "de", rows).name, "Google-Titel");
  assert.equal(selectMerchantTranslation(overridden, "en", "de", rows).description, "Google-Beschreibung");
});

test("source-language fields remain authoritative and only URL slugs can fall back", () => {
  assert.equal(selectMerchantTranslation(product, "en", "en", fields("Wrong legacy title", "Wrong legacy description")).name, product.name);
  assert.equal(selectMerchantTranslation(product, "en", "de", fields("Stahluhr", "Eine Automatikuhr.")).slug, product.slug);
});

test("a product with no source description uses its translated title rather than English", () => {
  const result = selectMerchantTranslation({ ...product, description: "" }, "en", "cs", fields("Ocelové hodinky", ""));
  assert.equal(result.description, "Ocelové hodinky");
});

test("a source paragraph copied into a foreign translation is rejected; shared model names are allowed", () => {
  const long = { ...product, description: "This automatic steel watch has a blue dial with silver hour markers and a brown leather strap." };
  assert.equal(selectMerchantTranslation(long, "en", "cs", fields("Ocelové hodinky", long.description)), null);
  const nameOnly = { ...product, name: "Rolex Submariner", description: "" };
  assert.equal(selectMerchantTranslation(nameOnly, "en", "de", fields("Rolex Submariner", "")).name, "Rolex Submariner");
});
