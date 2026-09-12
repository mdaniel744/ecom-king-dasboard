import test from "node:test";
import assert from "node:assert/strict";
import {
  KARIV_GLAMOUR_STORE_ID,
  KARIV_TRANSLATION_PROTECTED_PRODUCT_IDS,
  configuredProductContentLocales,
  detectEnglishOrGerman,
  resolveIncomingProductLocale,
  usesKarivProductLanguagePolicy,
} from "../lib/product-content-language.ts";

const kariv = {
  id: KARIV_GLAMOUR_STORE_ID,
  google_content_language: "en",
  enabled_locales: ["de"],
};
const otherStore = {
  id: "00000000-0000-4000-8000-000000000999",
  google_content_language: "de",
  enabled_locales: ["en"],
};

test("Kariv policy is isolated to the verified tenant id", () => {
  assert.equal(usesKarivProductLanguagePolicy(kariv), true);
  assert.equal(usesKarivProductLanguagePolicy(otherStore), false);
  assert.deepEqual(configuredProductContentLocales(kariv), ["en", "de"]);
  assert.deepEqual(configuredProductContentLocales(otherStore), []);
});

test("the two manually corrected products remain explicitly protected", () => {
  assert.equal(KARIV_TRANSLATION_PROTECTED_PRODUCT_IDS.has("7375cbf5-5588-4ca9-bd16-baae4be6a0e5"), true);
  assert.equal(KARIV_TRANSLATION_PROTECTED_PRODUCT_IDS.has("abb40274-aa40-44d7-93d3-6e93c552c51b"), true);
});

test("explicit writing language wins for Kariv product saves", () => {
  const fields = { name: "Rolex Uhr", description: "This watch is in excellent condition." };
  assert.equal(resolveIncomingProductLocale({ store: kariv, declaredLocale: "en", fields }), "en");
  assert.equal(resolveIncomingProductLocale({ store: kariv, declaredLocale: "de", fields }), "de");
});

test("legacy imports without a language use conservative English/German detection", () => {
  assert.equal(detectEnglishOrGerman("This watch is in excellent condition and comes with its box.").locale, "en");
  assert.equal(detectEnglishOrGerman("Diese Uhr ist in einem sehr guten Zustand und wird mit Box geliefert.").locale, "de");
  assert.equal(resolveIncomingProductLocale({
    store: kariv,
    fields: { name: "Rolex Daytona", description: "This watch is in excellent condition and comes with its box." },
  }), "en");
});

test("ambiguous legacy copy falls back to the configured English source", () => {
  assert.equal(resolveIncomingProductLocale({
    store: kariv,
    fields: { name: "Rolex Daytona 126500LN" },
  }), "en");
});

test("other tenants keep their existing source-language default", () => {
  assert.equal(resolveIncomingProductLocale({
    store: otherStore,
    declaredLocale: "en",
    fields: { description: "This is English." },
  }), "de");
});
