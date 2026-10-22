import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { compileFunction } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  compileFunction(code, ["require", "module", "exports"])(key => {
    if (key in mocks) return mocks[key];
    if (key === "server-only") return {};
    assert.ok(!key.startsWith("@/") && !key.startsWith("./"), `Unmocked dependency: ${key}`);
    return require(key);
  }, module, module.exports);
  return module.exports;
}
const amounts = load("../lib/checkout-invoice-amounts.ts");
const delivery = load("../lib/invoice-delivery.ts", { "./checkout-invoice-amounts": amounts });
const validation = load("../lib/validation.ts");
const result = load("../lib/action-result.ts", { "@/lib/validation": validation });
const storeId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000601";
const order = {
  id: orderId, store_id: storeId, currency: "EUR", subtotal: 1000, discount_amount: 0,
  shipping_amount: 0, tax_rate: 20, tax_amount: 200, total_amount: 1200,
  line_items: [{ price: 1000, quantity: 1, line_subtotal: 1000 }],
  payment_status: "pending", order_status: "pending_payment", updated_at: "2026-10-22T10:00:00Z",
};

test("VAT is charged on items plus delivery and does not mutate checkout", () => {
  const original = structuredClone(order);
  const invoice = delivery.prepareInvoiceDelivery(order, 100, 20);
  assert.equal(invoice.shipping_amount, 100);
  assert.equal(invoice.tax_amount, 220);
  assert.equal(invoice.total_amount, 1320);
  assert.deepEqual(order, original);
  const snapshot = delivery.snapshotInvoicePricing(invoice, "items_and_delivery", order.total_amount);
  assert.equal(snapshot.taxable_amount, 1100);
  assert.equal(snapshot.checkout_total, 1200);
  assert.equal(snapshot.basis, "items_and_delivery");
});

test("discounts reduce the taxable item cost, zero VAT is honored, and VAT is not added twice", () => {
  const discounted = { ...order, discount_amount: 100, tax_amount: 180, total_amount: 1080 };
  assert.equal(delivery.prepareInvoiceDelivery(discounted, 100, 20).total_amount, 1200);
  assert.equal(delivery.prepareInvoiceDelivery(order, 100, 0).total_amount, 1100);
  const inclusive = { ...order, subtotal: 100, tax_amount: 20, total_amount: 120,
    line_items: [{ price: 120, quantity: 1, line_total: 120, line_tax_amount: 20 }] };
  const invoice = delivery.prepareInvoiceDelivery(inclusive, 10, 20);
  assert.equal(invoice.tax_amount, 22);
  assert.equal(invoice.total_amount, 132);
});

test("decimal fees and percentage rates round half-up in integer minor units", () => {
  const small = { ...order, subtotal: 10.01, tax_amount: 0, tax_rate: 0, total_amount: 10.01,
    line_items: [{ price: 10.01, quantity: 1, line_subtotal: 10.01 }] };
  assert.equal(delivery.prepareInvoiceDelivery(small, 2, 19.5).tax_amount, 2.34);
  assert.equal(delivery.prepareInvoiceDelivery(small, 2, 19.5).total_amount, 14.35);
  const one = { ...small, subtotal: 1, total_amount: 1, line_items: [{ price: 1, quantity: 1 }] };
  assert.equal(delivery.prepareInvoiceDelivery(one, 0, 0.5).tax_amount, 0.01);
});

test("invalid fees, VAT rates and missing inputs cannot be used", () => {
  for (const fee of [-1, NaN, Infinity, 1_000_000_001, 0.001, null, "100"]) {
    assert.throws(() => delivery.prepareInvoiceDelivery(order, fee, 20), /delivery fee/);
  }
  for (const rate of [-1, 101, NaN, Infinity, 20.001, null, "20"]) {
    assert.throws(() => delivery.prepareInvoiceDelivery(order, 100, rate), /VAT rate/);
  }
  for (const value of ["", " ", "-1", "1.111", "1e2", "NaN"]) assert.equal(delivery.parseInvoiceNumber(value), null);
  assert.equal(delivery.parseInvoiceNumber("0"), 0);
  assert.equal(delivery.parseInvoiceNumber(" 12.50 "), 12.5);
});

test("settled orders cannot edit fees; archived resends retain their exact old tax and total", () => {
  for (const payment_status of ["paid", "refunded"]) assert.equal(delivery.canEditInvoiceDelivery({ ...order, payment_status }), false);
  for (const order_status of ["completed", "cancelled"]) assert.equal(delivery.canEditInvoiceDelivery({ ...order, order_status }), false);
  assert.equal(delivery.canEditInvoiceDelivery(order), true);
  const invoice = delivery.prepareInvoiceDelivery(order, 100, 20);
  const snapshot = delivery.snapshotInvoicePricing(invoice, "items_and_delivery", 1200);
  assert.equal(delivery.restoreInvoicePricing({ ...order, payment_status: "paid" }, snapshot).total_amount, 1320);
  assert.throws(() => delivery.restoreInvoicePricing({ ...order, currency: "CZK" }, snapshot), /changed/);
});

function actionFixture({ savedOrder = order, historyError = null, archived = [], authError = null } = {}) {
  const sent = [], revalidated = [], queries = [];
  class InvoiceDeliveryError extends Error {}
  const actions = load("../app/dashboard/store-orders/actions.ts", {
    "next/cache": { revalidatePath: value => revalidated.push(value) },
    "@/lib/get-current-store": { getCurrentStore: async () => { if (authError) throw authError; return { id: storeId }; } },
    "@/lib/supabase-admin": { supabaseAdmin: { from(table) {
      assert.equal(table, "checkout_orders"); const filters = []; queries.push(filters);
      const chain = { select() { return chain; }, eq(key, value) { filters.push([key, value]); return chain; },
        single() { return Promise.resolve({ error: null, data: savedOrder && filters.every(([key, value]) => savedOrder[key] === value) ? savedOrder : null }); } };
      return chain;
    } } },
    "@/lib/invoice-documents": { InvoiceDeliveryError,
      getOrderInvoiceDocuments: async (id, selectedOrder) => { assert.equal(id, storeId); assert.equal(selectedOrder, orderId); return { documents: archived, error: historyError }; },
      deliverCheckoutInvoice: async (...args) => sent.push(args),
    },
    "@/lib/invoice-delivery": delivery, "@/lib/checkout-invoice-amounts": amounts,
    "@/lib/invoice-settings": { getInvoiceSettings: async () => ({ store_id: storeId }) },
    "@/lib/payment-settings": { getPaymentSettings: async () => ({ store_id: storeId }) },
    "@/lib/validation": validation, "@/lib/action-result": result,
  });
  return { actions, sent, revalidated, queries };
}
const fields = { deliveryFee: 100, vatRate: 20, expectedUpdatedAt: order.updated_at };

test("send action derives items from the authenticated store and uses the same approved delivery/VAT as the preview", async () => {
  const fixture = actionFixture();
  const outcome = await fixture.actions.sendCheckoutOrderInvoice(orderId, fields);
  assert.equal(outcome.success, true);
  assert.equal(fixture.sent[0][0].total_amount, 1320);
  assert.equal(fixture.sent[0][0].tax_amount, 220);
  assert.deepEqual(fixture.sent[0][4], { pricingBasis: "items_and_delivery", checkoutTotal: 1200 });
  assert.deepEqual(fixture.queries[0], [["id", orderId], ["store_id", storeId]]);
  assert.ok(fixture.revalidated.includes("/dashboard/invoices"));
  assert.equal(order.total_amount, 1200);
});

test("send action rejects other stores, settled orders, stale previews, invalid or injected amounts, and a missing archive", async () => {
  for (const options of [
    { savedOrder: { ...order, store_id: "another-store" } }, { savedOrder: { ...order, payment_status: "paid" } },
    { savedOrder: { ...order, updated_at: "new-version" } }, { historyError: "Run the invoice migration" },
  ]) {
    const fixture = actionFixture(options);
    assert.equal((await fixture.actions.sendCheckoutOrderInvoice(orderId, fields)).success, false);
    assert.equal(fixture.sent.length, 0);
  }
  for (const invalid of [
    { ...fields, deliveryFee: -1 }, { ...fields, vatRate: 101 }, { ...fields, deliveryFee: 0.001 },
    { ...fields, deliveryFee: "100" }, { ...fields, total_amount: 1 }, { ...fields, store_id: "another-store" },
  ]) {
    const fixture = actionFixture();
    assert.equal((await fixture.actions.sendCheckoutOrderInvoice(orderId, invalid)).success, false);
    assert.equal(fixture.sent.length, 0);
  }
});

test("a paid invoice resend restores archived pricing and does not swallow authentication redirects", async () => {
  const invoice = delivery.prepareInvoiceDelivery(order, 100, 20);
  const fixture = actionFixture({ savedOrder: { ...order, payment_status: "paid" },
    archived: [{ send_status: "sent", pricing_snapshot: delivery.snapshotInvoicePricing(invoice, "items_and_delivery", 1200) }] });
  assert.equal((await fixture.actions.sendCheckoutOrderInvoice(orderId)).success, true);
  assert.equal(fixture.sent[0][0].total_amount, 1320);
  const denied = actionFixture({ authError: new Error("NEXT_REDIRECT") });
  await assert.rejects(denied.actions.sendCheckoutOrderInvoice(orderId, fields), /NEXT_REDIRECT/);
  assert.equal(denied.sent.length, 0);
});
