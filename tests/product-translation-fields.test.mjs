import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_CONTENT_FIELDS } from "../lib/product-content-language.ts";
import { isUntranslatedCopy, shouldTranslateField } from "../lib/translation-quality.ts";

const required = ["short_description", "meta_title", "meta_description"];
const options = { source: "Steel watch with a blue dial", sourceLocale: "en", targetLocale: "de", field: "meta_title", onlyMissing: true, sourceChanged: false };

test("every product workflow includes short description and both SEO fields", () => {
  for (const field of required) assert.ok(PRODUCT_CONTENT_FIELDS.includes(field));
});
test("all three fields are queued for every configured target when missing or blank", () => {
  for (const field of required) for (const targetLocale of ["de", "cs"]) {
    assert.equal(shouldTranslateField({ ...options, field, targetLocale }), true);
    assert.equal(shouldTranslateField({ ...options, field, targetLocale, existing: { value: "  ", translator: "ai" } }), true);
  }
});
test("changed SEO fields refresh AI translations without regenerating unchanged fields", () => {
  const existing = { value: "Uhr mit blauem Zifferblatt", translator: "ai" };
  assert.equal(shouldTranslateField({ ...options, existing }), false);
  assert.equal(shouldTranslateField({ ...options, existing, sourceChanged: true }), true);
});
test("human corrections stay locked even when source changes", () => {
  assert.equal(shouldTranslateField({ ...options, existing: { value: "Handbearbeitet", translator: "human" }, sourceChanged: true, onlyMissing: false }), false);
});
test("English copies are retried instead of counted as completed translations", () => {
  for (const field of required) {
    assert.equal(shouldTranslateField({ ...options, field, existing: { value: options.source, translator: "ai" } }), true);
  }
});
test("proper model names and same-language regional variants may remain unchanged", () => {
  assert.equal(isUntranslatedCopy("Rolex Submariner 126610LN", "Rolex Submariner 126610LN", "en", "de", "meta_title"), false);
  assert.equal(isUntranslatedCopy(options.source, options.source, "en", "en-GB", "short_description"), false);
});
test("empty source fields are not invented by translation", () => {
  assert.equal(shouldTranslateField({ ...options, source: " " }), false);
});
