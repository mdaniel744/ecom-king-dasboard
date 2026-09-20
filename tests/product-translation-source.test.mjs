import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ts from "typescript";
import * as contentLanguage from "../lib/product-content-language.ts";
import { translationSourceState } from "../lib/translation-source.ts";

const fields = ["short_description", "meta_title", "meta_description"];

test("fresh AI-written fields are unsaved sources, not missing source text", () => {
  for (const field of fields) {
    assert.equal(translationSourceState(field, { [field]: "AI-written copy" }, { [field]: null }), "unsaved");
    assert.equal(translationSourceState(field, { [field]: "New copy" }, { [field]: "Old copy" }), "unsaved");
    assert.equal(translationSourceState(field, { [field]: "  Saved copy " }, { [field]: "Saved copy" }), "saved");
    assert.equal(translationSourceState(field, { [field]: "" }, { [field]: "Saved copy" }), "unsaved");
    assert.equal(translationSourceState(field, { [field]: " " }, { [field]: null }), "empty");
  }
});

function workflowFixture() {
  const calls = [];
  const imports = {
    "server-only": {},
    "@/lib/supabase-admin": {},
    "@/lib/translate": {},
    "@/lib/product-content-language": contentLanguage,
    "@/lib/translation-sync": { syncTranslations: async (args) => { calls.push(args); return { failures: [] }; } },
  };
  const source = readFileSync(new URL("../lib/product-translation-workflow.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  compileFunction(compiled, ["require", "module", "exports"])((key) => {
    assert.ok(key in imports, key); return imports[key];
  }, module, module.exports);
  return { ...module.exports, calls };
}

test("save workflow translates the exact Search Engine Listing and original short-description fields", async () => {
  const workflow = workflowFixture();
  const product = { id: "product", name: "Different title", description: "Different full description",
    short_description: "Original short description", meta_title: "AI-written SEO title",
    meta_description: "AI-written SEO description", google_title: "Separate Merchant title",
    google_description: "Separate Merchant description" };
  const store = { id: "store", google_content_language: "en", enabled_locales: ["de", "cs"] };
  await workflow.syncProductTranslations(store, product);
  const [call] = workflow.calls;
  for (const field of fields) assert.equal(call.fields[field], product[field]);
  assert.equal(call.onlyMissing, true);
  assert.equal(call.store, store);
  assert.deepEqual(workflow.changedProductContentFields(
    { ...product, meta_title: "Old SEO title", meta_description: null, short_description: null },
    workflow.productContentValues(product)
  ).sort(), [...fields].sort());
});

test("empty SEO fields never silently use the search preview or Merchant fallback as source", async () => {
  const workflow = workflowFixture();
  await workflow.syncProductTranslations({ id: "store" }, { id: "product", name: "Preview title", description: "Full description", google_title: "Merchant title" });
  for (const field of fields) assert.equal(workflow.calls[0].fields[field], null);
});

function renderEditor(current, saved) {
  const require = createRequire(import.meta.url);
  const tag = (name) => ({ children, ...props }) => createElement(name,
    Object.fromEntries(Object.entries(props).filter(([key]) => !["variant", "size"].includes(key))), children);
  const imports = {
    "react": { useEffect() {}, useState: (value) => [value === true ? false : value, () => {}] },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "sonner": { toast: {} },
    "lucide-react": Object.fromEntries(["AlertTriangle", "Loader2", "Pencil", "RotateCcw", "Sparkles"].map(name => [name, tag("span")])),
    "@/components/ui/button": { Button: tag("button") },
    "@/components/ui/input": { Input: tag("input") },
    "@/components/ui/textarea": { Textarea: tag("textarea") },
    "@/components/ui/badge": { Badge: tag("span") },
    "@/components/ui/card": Object.fromEntries(["Card", "CardContent", "CardHeader", "CardTitle"].map(name => [name, tag("div")])),
    "@/lib/merchant-locales": { CONTENT_LANGUAGE_OPTIONS: [{ value: "de", label: "German" }] },
    "@/lib/translation-source": { translationSourceState },
    "@/app/dashboard/translations/actions": {},
    "@/app/dashboard/products/actions": {},
  };
  const source = readFileSync(new URL("../components/dashboard/translation-editor.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  compileFunction(compiled, ["require", "module", "exports"])((key) => {
    assert.ok(key in imports, key); return imports[key];
  }, module, module.exports);
  return renderToStaticMarkup(createElement(module.exports.TranslationEditor, {
    entityType: "product", entityId: "product", enabledLocales: ["de"], sourceValues: current, savedSourceValues: saved,
    fields: fields.map(name => ({ name, label: name, sourceLabel: name === "short_description" ? "Original product details" : "Search Engine Listing" })),
  }));
}

test("translation editor renders each exact source and distinguishes unsaved AI copy", () => {
  const source = { short_description: "Original summary", meta_title: "AI SEO title", meta_description: "AI SEO description <safe>" };
  const html = renderEditor(source, {});
  assert.ok(html.includes("Source: Search Engine Listing (unsaved)"));
  assert.ok(html.includes("Source: Original product details (unsaved)"));
  assert.ok(html.includes("Original summary"));
  assert.ok(html.includes("AI SEO title"));
  assert.ok(html.includes("AI SEO description &lt;safe&gt;"));
  assert.ok(html.includes("Save product to translate"));
  assert.match(html, /<button[^>]*disabled=""[^>]*>.*?Retry missing<\/button>/);
  assert.ok(!html.includes("No source text — add it and save to translate"));
});

test("saved sources await translation while truly empty fields are labelled accurately", () => {
  const source = { short_description: "Saved summary", meta_title: "", meta_description: null };
  const html = renderEditor(source, source);
  assert.ok(html.includes("Translation pending — refreshes automatically"));
  assert.ok(html.includes("No source text — add it and save to translate"));
  assert.ok(!html.includes("Source text changed."));
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>.*?Retry missing<\/button>/);
});
