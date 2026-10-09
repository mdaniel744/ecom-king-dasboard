import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { compileFunction } from "node:vm";
import ts from "typescript";

function demoClient() {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL("../lib/local-demo.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  compileFunction(compiled, ["require", "module", "exports", "process"])(
    key => key === "server-only" ? {} : require(key),
    module, module.exports, { env: { LOCAL_DEMO_MODE: "true" } }
  );
  return module.exports.createLocalDemoClient();
}

test("demo IS NULL supports the merged team filter without returning removed or other-store members", async () => {
  const db = demoClient();
  await db.from("store_members").insert([
    { id: "active", store_id: "store-a", removed_at: null },
    { id: "legacy", store_id: "store-a" },
    { id: "removed", store_id: "store-a", removed_at: "2026-10-09T00:00:00Z" },
    { id: "other", store_id: "store-b", removed_at: null },
  ]);
  const { data, error } = await db.from("store_members").select("id").eq("store_id", "store-a").is("removed_at", null);
  assert.equal(error, null);
  assert.deepEqual(data.map(row => row.id), ["active", "legacy"]);
});

test("demo IS boolean distinguishes true, false and missing values", async () => {
  const db = demoClient();
  await db.from("filter_test").insert([
    { id: "yes", enabled: true }, { id: "no", enabled: false }, { id: "missing" },
  ]);
  for (const [value, id] of [[true, "yes"], [false, "no"]]) {
    const { data } = await db.from("filter_test").select().is("enabled", value);
    assert.deepEqual(data.map(row => row.id), [id]);
  }
});
