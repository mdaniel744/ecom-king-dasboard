import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import ts from "typescript";
import * as quality from "../lib/translation-quality.ts";

function fixture(seed = [], { readError = false, beforeSave } = {}) {
  const rows = seed.map((row) => ({ store_id: "kariv", entity_type: "product", entity_id: "watch", ...row }));
  const calls = [];
  const client = { from(table) {
    assert.equal(table, "translations");
    const query = { filters: [], operation: "read", payload: null,
      select() { return this; },
      eq(key, value) { this.filters.push((row) => row[key] === value); return this; },
      in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; },
      update(payload) { this.operation = "update"; this.payload = payload; return this; },
      upsert(payload, options) { this.operation = "insert"; this.payload = payload; assert.equal(options.ignoreDuplicates, true); return this; },
      then(resolve) {
        if (readError && this.operation === "read") return Promise.resolve({ data: null, error: { message: "Unavailable" } }).then(resolve);
        let matches = rows.filter((row) => this.filters.every((filter) => filter(row)));
        if (this.operation === "update") matches.forEach((row) => Object.assign(row, this.payload));
        if (this.operation === "insert") {
          const keyFields = ["entity_type", "entity_id", "field_name", "locale"];
          if (rows.some((row) => keyFields.every((key) => row[key] === this.payload[key]))) matches = [];
          else { rows.push({ ...this.payload }); matches = [rows.at(-1)]; }
        }
        return Promise.resolve({ data: matches.map((row) => ({ ...row })), error: null }).then(resolve);
      },
    };
    return query;
  } };
  const imports = { "server-only": {}, "@/lib/supabase-admin": { supabaseAdmin: client },
    "@/lib/translation-quality": quality, "@/lib/slug": { slugify: (value) => value.toLowerCase() },
    "@/lib/translate": { translateText: async (args) => {
      calls.push(args); beforeSave?.(rows, args); return `${args.targetLocale}: ${args.text}`;
    } },
  };
  const source = readFileSync(new URL("../lib/translation-sync.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  compileFunction(compiled, ["require", "module", "exports"])((key) => {
    assert.ok(key in imports, key); return imports[key];
  }, module, module.exports);
  return { sync: module.exports.syncTranslations, rows, calls };
}
const fields = { short_description: "Short summary", meta_title: "SEO title", meta_description: "SEO description" };
const input = { store: { id: "kariv", google_content_language: "en", enabled_locales: ["de", "cs"] }, entityType: "product", entityId: "watch", fields, onlyMissing: true };

test("the actual sync saves all three fields into German and Czech translation rows", async () => {
  const f = fixture();
  const result = await f.sync(input);
  assert.equal(result.succeeded, 6);
  assert.equal(result.failures.length, 0);
  assert.equal(f.rows.length, 6);
  assert.ok(f.rows.every((row) => row.store_id === "kariv" && row.entity_id === "watch"));
  for (const call of f.calls) assert.equal(call.text, fields[call.fieldRole]);
});
test("provided short descriptions and SEO copy translate for other stores and their configured languages too", async () => {
  const f = fixture();
  const result = await f.sync({ ...input, store: { id: "other-store", google_content_language: "en", enabled_locales: ["en", "fr", "pl"] } });
  assert.equal(result.succeeded, 6);
  assert.deepEqual([...new Set(f.calls.map((call) => call.targetLocale))].sort(), ["fr", "pl"]);
  assert.ok(f.rows.every((row) => row.store_id === "other-store"));
});
test("an SEO-only edit refreshes AI copy and flags the human field without replacing it", async () => {
  const f = fixture([
    { locale: "de", field_name: "meta_title", value: "Menschlicher Titel", translator: "human" },
    { locale: "cs", field_name: "meta_title", value: "Starý název", translator: "ai" },
  ]);
  await f.sync({ ...input, fields: { meta_title: "New title" }, sourceChangedFields: ["meta_title"] });
  assert.equal(f.calls.length, 1);
  assert.equal(f.rows[0].value, "Menschlicher Titel");
  assert.equal(f.rows[0].needs_review, true);
  assert.equal(f.rows[1].value, "cs: New title");
});
test("a human edit made during translation cannot be overwritten", async () => {
  const f = fixture([{ locale: "de", field_name: "meta_title", value: "Previous", translator: "ai" }], {
    beforeSave: (rows) => Object.assign(rows[0], { value: "Concurrent human correction", translator: "human" }),
  });
  const result = await f.sync({ ...input, store: { ...input.store, enabled_locales: ["de"] }, fields: { meta_title: "New title" }, sourceChangedFields: ["meta_title"] });
  assert.equal(result.succeeded, 0);
  assert.equal(f.rows[0].value, "Concurrent human correction");
});
test("a failed existing-translation lookup stops writes and reports failure", async () => {
  const f = fixture([], { readError: true });
  const result = await f.sync(input);
  assert.equal(result.failures.length, 1);
  assert.equal(f.calls.length, 0);
  assert.equal(f.rows.length, 0);
});
