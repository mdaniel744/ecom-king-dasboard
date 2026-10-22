import { checkoutInvoiceAmounts, CheckoutInvoiceAmountError } from "./checkout-invoice-amounts";
import type { CheckoutOrder } from "./types";

export type InvoicePricingSnapshot = {
  version: 1;
  basis: "checkout" | "items_and_delivery";
  currency: string;
  subtotal: number;
  discount: number;
  delivery: number;
  vat_rate: number | null;
  taxable_amount: number | null;
  tax: number;
  total: number;
  checkout_total: number;
};

export function canEditInvoiceDelivery(order: Pick<CheckoutOrder, "payment_status" | "order_status">) {
  return (order.payment_status === "pending" || order.payment_status === "failed") &&
    order.order_status !== "completed" && order.order_status !== "cancelled";
}

export function parseInvoiceNumber(value: string): number | null {
  const trimmed = value.trim();
  return /^\d+(?:\.\d{1,2})?$/.test(trimmed) && Number.isFinite(Number(trimmed)) ? Number(trimmed) : null;
}

function validDecimal(value: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max &&
    Math.round(value * 100) / 100 === value;
}

export type InvoiceDeliveryAmounts = Pick<CheckoutOrder,
  "subtotal" | "discount_amount" | "shipping_amount" | "tax_amount" | "tax_rate" | "total_amount"
>;

/** Staff-approved invoice calculation. Never mutates the original checkout. */
export function prepareInvoiceDelivery<T extends InvoiceDeliveryAmounts>(order: T, delivery: number, vatRate: number) {
  const original = checkoutInvoiceAmounts(order);
  if (!validDecimal(delivery, 1_000_000_000)) {
    throw new CheckoutInvoiceAmountError("Enter a delivery fee from 0 to 1,000,000,000 with at most two decimal places.");
  }
  if (!validDecimal(vatRate, 100)) {
    throw new CheckoutInvoiceAmountError("Enter a VAT rate from 0 to 100 with at most two decimal places.");
  }
  const taxableCents = Math.round(original.subtotal * 100) - Math.round(original.discount * 100) + Math.round(delivery * 100);
  if (taxableCents < 0) throw new CheckoutInvoiceAmountError("The discount exceeds the product cost and delivery fee.");
  // Rate is stored in hundredths of a percent; round half-up in integer minor units.
  const taxCents = Number((BigInt(taxableCents) * BigInt(Math.round(vatRate * 100)) + 5000n) / 10000n);
  const invoice = {
    ...order, shipping_amount: delivery, tax_rate: vatRate, tax_amount: taxCents / 100,
    total_amount: (taxableCents + taxCents) / 100,
  };
  checkoutInvoiceAmounts(invoice);
  return invoice;
}

export function snapshotInvoicePricing(order: CheckoutOrder, basis: InvoicePricingSnapshot["basis"] = "checkout", checkoutTotal = order.total_amount): InvoicePricingSnapshot {
  const amounts = checkoutInvoiceAmounts(order);
  return {
    version: 1, basis, currency: order.currency, ...amounts,
    vat_rate: order.tax_rate ?? null,
    taxable_amount: basis === "items_and_delivery"
      ? (Math.round(amounts.subtotal * 100) - Math.round(amounts.discount * 100) + Math.round(amounts.delivery * 100)) / 100 : null,
    checkout_total: checkoutTotal,
  };
}

/** A resend of a settled invoice must keep its archived amounts, not recalculate VAT. */
export function restoreInvoicePricing(order: CheckoutOrder, snapshot: InvoicePricingSnapshot | null | undefined) {
  if (!snapshot) return order;
  if (snapshot.version !== 1 || snapshot.currency !== order.currency || snapshot.subtotal !== order.subtotal || snapshot.discount !== order.discount_amount) {
    throw new CheckoutInvoiceAmountError("This order has changed since its last invoice. Review the order before resending.");
  }
  const invoice = { ...order, shipping_amount: snapshot.delivery, tax_amount: snapshot.tax,
    total_amount: snapshot.total, tax_rate: snapshot.vat_rate ?? undefined };
  checkoutInvoiceAmounts(invoice);
  return invoice;
}
