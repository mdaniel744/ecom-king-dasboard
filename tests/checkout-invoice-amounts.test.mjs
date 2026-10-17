import test from "node:test";
import assert from "node:assert/strict";
import { checkoutInvoiceAmounts, invoiceLineSubtotal, invoiceLineUnitPrice, CheckoutInvoiceAmountError } from "../lib/checkout-invoice-amounts.ts";

const snapshot = { subtotal: 200, discount_amount: 20, tax_amount: 34.2, shipping_amount: 15.5, total_amount: 229.7 };

test("invoice uses exact saved product cost, discount, taxes and delivery without changing the total", () => {
  const original = structuredClone(snapshot);
  assert.deepEqual(checkoutInvoiceAmounts(snapshot), { subtotal: 200, discount: 20, tax: 34.2, delivery: 15.5, total: 229.7 });
  assert.deepEqual(snapshot, original);
});

test("tax-inclusive line totals are not taxed again, and zero saved line amounts are retained", () => {
  const inclusive = { price: 119, quantity: 1, line_total: 119, line_tax_amount: 19 };
  assert.equal(invoiceLineSubtotal(inclusive), 100);
  assert.equal(invoiceLineUnitPrice(inclusive), 100);
  assert.equal(checkoutInvoiceAmounts({ subtotal: 100, discount_amount: 0, tax_amount: 19, shipping_amount: 12,
    total_amount: 131, line_items: [inclusive] }).total, 131);
  assert.equal(invoiceLineSubtotal({ price: 100, quantity: 1, line_subtotal: 0, line_total: 0, line_tax_amount: 0 }), 0);
});

test("saved line rounding takes priority over multiplying display-rounded unit prices", () => {
  const item = { price: 33.33, quantity: 3, line_subtotal: 100 };
  assert.equal(invoiceLineSubtotal(item), 100);
  assert.equal(checkoutInvoiceAmounts({ subtotal: 100, discount_amount: 5, tax_amount: 18.05, shipping_amount: 12.5,
    total_amount: 125.55, line_items: [item] }).total, 125.55);
  assert.equal(invoiceLineSubtotal({ price: 0.1, quantity: 3 }), 0.3);
});

test("stored zero tax/delivery remain zero and decimal totals balance in minor units", () => {
  assert.deepEqual(checkoutInvoiceAmounts({ subtotal: 0.1, discount_amount: 0, tax_amount: 0.2, shipping_amount: 0, total_amount: 0.3 }),
    { subtotal: 0.1, discount: 0, tax: 0.2, delivery: 0, total: 0.3 });
  assert.equal(checkoutInvoiceAmounts({ subtotal: 100, discount_amount: 100, tax_amount: 0, shipping_amount: 0, total_amount: 0 }).total, 0);
});

test("invalid or unbalanced checkout snapshots stop invoicing rather than guessing missing fees or rewriting the total", () => {
  for (const bad of [
    { ...snapshot, total_amount: 200 }, { ...snapshot, shipping_amount: undefined },
    { ...snapshot, tax_amount: null }, { ...snapshot, total_amount: NaN },
    { ...snapshot, tax_amount: Infinity }, { ...snapshot, discount_amount: -1 },
    { ...snapshot, total_amount: "229.70" },
    { ...snapshot, line_items: [{ price: 199, quantity: 1, line_subtotal: 199 }] },
  ]) assert.throws(() => checkoutInvoiceAmounts(bad), CheckoutInvoiceAmountError);
  for (const item of [
    { price: 10, quantity: 0 }, { price: -1, quantity: 1 }, { price: NaN, quantity: 1 },
    { price: 10, quantity: 1, line_subtotal: -1 },
  ]) assert.throws(() => invoiceLineSubtotal(item), CheckoutInvoiceAmountError);
});
