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

test("demo market VAT survives a separate page/action module load in the same server session", async () => {
  const firstPage = demoClient();
  const { data: store } = await firstPage.from("stores").select().single();
  const originalRates = store.vat_rates;
  try {
    await firstPage.from("stores").update({ vat_rates: { DE: 19, CZ: 21 } }).eq("id", store.id);
    const nextPage = demoClient();
    const { data: sharedStore } = await nextPage.from("stores").select().single();
    assert.deepEqual(sharedStore.vat_rates, { DE: 19, CZ: 21 });
  } finally {
    await firstPage.from("stores").update({ vat_rates: originalRates }).eq("id", store.id);
  }
});

test("demo invoice archive survives separate send-action and PDF-download modules", async () => {
  const sender = demoClient();
  const id = "00000000-0000-4000-8000-000000000901";
  try {
    await sender.from("checkout_invoice_documents").insert({
      id, store_id: "demo-store", order_id: "demo-order", pdf_base64: "JVBERi0=", send_status: "sent",
    });
    const downloader = demoClient();
    const { data } = await downloader.from("checkout_invoice_documents").select("pdf_base64")
      .eq("id", id).eq("store_id", "demo-store").eq("order_id", "demo-order").single();
    assert.equal(data.pdf_base64, "JVBERi0=");
  } finally {
    await sender.from("checkout_invoice_documents").delete().eq("id", id);
  }
});
