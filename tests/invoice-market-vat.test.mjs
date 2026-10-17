import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { compileFunction } from "node:vm";
import ts from "typescript";
import * as invoiceVat from "../lib/invoice-vat.ts";

const require = createRequire(import.meta.url);
function loadModule(path, mocks = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  compileFunction(compiled, ["require", "module", "exports"])(key => {
    if (key in mocks) return mocks[key];
    if (key === "server-only") return {};
    assert.ok(!key.startsWith("@/"), `Unmocked dependency: ${key}`);
    return require(key);
  }, module, module.exports);
  return module.exports;
}

const locales = loadModule("../lib/merchant-locales.ts", {
  "./tenant-ids.js": loadModule("../lib/tenant-ids.js"),
});
const validation = loadModule("../lib/validation.ts");
const actionResult = loadModule("../lib/action-result.ts", { "@/lib/validation": validation });

function marketFixture(overrides = {}, dbError = null) {
  const writes = [];
  const revalidated = [];
  const store = {
    id: "trusted-store", google_feed_label: "DE", google_feed_labels: ["DE", "CZ"],
    google_content_language: "en", enabled_locales: ["de", "cs"],
    vat_rates: { DE: 19, CZ: 21, GB: 5 }, market_currencies: { DE: "EUR", CZ: "CZK" },
    ...overrides,
  };
  const actions = loadModule("../app/dashboard/market/actions.ts", {
    "next/cache": { revalidatePath: path => revalidated.push(path) },
    "@/lib/get-current-store": { getCurrentStore: async () => store },
    "@/lib/supabase-admin": { supabaseAdmin: { from(table) {
      assert.equal(table, "stores");
      return { update(payload) { return { eq(column, id) {
        writes.push({ payload, column, id }); return Promise.resolve({ error: dbError });
      } }; } };
    } } },
    "@/lib/validation": validation, "@/lib/action-result": actionResult,
    "@/lib/google-merchant": {}, "@/lib/merchant-locales": locales,
  });
  return { store, actions, writes, revalidated };
}

test("invoice VAT saves shared market rates with decimals and explicit zero, scoped to the authenticated store", async () => {
  const { actions, writes, revalidated } = marketFixture();
  assert.equal((await actions.updateMarketVatRates({ DE: 19.5, CZ: 0 })).success, true);
  assert.deepEqual(writes, [{ column: "id", id: "trusted-store", payload: { vat_rates: { DE: 19.5, CZ: 0, GB: 5 } } }]);
  assert.ok(revalidated.includes("/dashboard/invoices/settings"));
  assert.ok(revalidated.includes("/dashboard/market/delivery-markets"));
  assert.ok(revalidated.includes("/dashboard/market/xml-feed-urls"));
});

test("invalid rates, missing markets, injected countries and stale selections cannot write VAT settings", async () => {
  for (const values of [
    { DE: -1, CZ: 21 }, { DE: 101, CZ: 21 }, { DE: NaN, CZ: 21 },
    { DE: Infinity, CZ: 21 }, { DE: "19", CZ: 21 }, { DE: null, CZ: 21 },
    { DE: 19 }, {}, { DE: 19, CZ: 21, US: 0 }, { DE: 19, CZ: 21, store_id: "other" }, null,
  ]) {
    const fixture = marketFixture();
    const result = await fixture.actions.updateMarketVatRates(values);
    assert.equal(result.success, false, JSON.stringify(values));
    assert.equal(fixture.writes.length, 0);
  }
});

test("a single market stays single regardless of storefront languages and honors 0% rather than a global fallback", async () => {
  const fixture = marketFixture({ google_feed_labels: [], vat_rates: { DE: 0 } });
  assert.deepEqual(locales.getStoreMarketPricing(fixture.store), [{ market: "DE", currency: "EUR", vatRate: 0 }]);
  assert.equal((await fixture.actions.updateMarketVatRates({ DE: 0 })).success, true);
  assert.deepEqual(fixture.writes[0].payload.vat_rates, { DE: 0 });
});

test("database failures do not report success or invalidate pages", async () => {
  const fixture = marketFixture({}, { code: "08006" });
  assert.equal((await fixture.actions.updateMarketVatRates({ DE: 19, CZ: 21 })).success, false);
  assert.deepEqual(fixture.revalidated, []);
});

test("saving VAT from Delivery Markets also refreshes the invoice customizer", async () => {
  const fixture = marketFixture();
  const form = new FormData();
  for (const market of ["DE", "CZ"]) {
    form.append("google_feed_labels", market);
    form.set(`market_currency_${market}`, fixture.store.market_currencies[market]);
    form.set(`vat_rate_${market}`, String(fixture.store.vat_rates[market]));
  }
  form.set("product_url_path", "products");
  assert.equal((await fixture.actions.updateDeliveryMarketSettings(form)).success, true);
  assert.ok(fixture.revalidated.includes("/dashboard/invoices/settings"));
});

test("invoice preview uses the selected market's VAT on net products, matching checkout without a second delivery tax", () => {
  assert.deepEqual(invoiceVat.invoicePreviewTotals(2880, 620, 19), { taxAmount: 547.2, total: 4047.2 });
  assert.deepEqual(invoiceVat.invoicePreviewTotals(2880, 620, 21), { taxAmount: 604.8, total: 4104.8 });
  assert.deepEqual(invoiceVat.invoicePreviewTotals(2880, 620, 0), { taxAmount: 0, total: 3500 });
  assert.deepEqual(invoiceVat.invoicePreviewTotals(10.01, 2, 19.5), { taxAmount: 1.95, total: 13.96 });
});

test("invoice tax labels preserve recorded zero, localize decimal rates, and never guess an unknown historical rate", () => {
  assert.equal(invoiceVat.invoiceVatLabel("VAT", 0, "en"), "VAT (0%)");
  assert.equal(invoiceVat.invoiceVatLabel("MwSt.", 21.5, "de"), "MwSt. (21,5%)");
  for (const rate of [undefined, null, NaN, Infinity, -1, 101]) {
    assert.equal(invoiceVat.invoiceVatLabel("VAT", rate, "en"), "VAT");
  }
});

test("actual invoice emails retain checkout tax and total, rather than recalculating with current invoice defaults", async () => {
  const emails = [];
  const defaults = loadModule("../lib/invoice-settings-defaults.ts");
  const i18n = loadModule("../lib/invoice-i18n.ts");
  const invoice = loadModule("../lib/checkout-invoice.ts", {
    "@/lib/mailer": { sendMail: async email => emails.push(email), resolveStoreSmtp: () => undefined },
    "@/lib/checkout-order-display": { addressLines: () => [], formatOrderMoney: (value, currency) => `${currency} ${value.toFixed(2)}` },
    "@/lib/invoice-settings-defaults": defaults,
    "@/lib/payment-settings-defaults": { defaultPaymentSettings: () => ({ bank_transfer_enabled: false }) },
    "@/lib/payment-currency": { bankTransferForCurrency: () => ({ supported: true }) },
    "@/lib/invoice-i18n": i18n, "@/lib/invoice-vat": invoiceVat,
    "@/lib/checkout-invoice-amounts": loadModule("../lib/checkout-invoice-amounts.ts"),
  });
  const order = {
    store_id: "trusted-store", order_number: "ORD-1", customer_name: "Example", customer_email: "example@example.com",
    created_at: "2026-10-17T12:00:00Z", locale: "en", currency: "EUR",
    line_items: [{ title: "Example product", price: 100, quantity: 1 }],
    subtotal: 100, shipping_amount: 10, discount_amount: 0, tax_amount: 21, tax_rate: 21, total_amount: 131,
  };
  const settings = { ...defaults.defaultInvoiceSettings(order.store_id, "Example Store"), vat_percentage: 99 };
  await invoice.sendCheckoutInvoiceEmail(order, { name: "Example Store" }, settings);
  assert.ok(emails[0].html.includes("Tax (21%)"));
  assert.ok(emails[0].html.includes("EUR 21.00"));
  assert.ok(emails[0].html.includes("EUR 131.00"));
  assert.ok(!emails[0].html.includes("99%"));
});
