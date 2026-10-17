import type { CheckoutOrder, OrderLineItem } from "@/lib/types";

export type InvoiceOrderPreview = Pick<CheckoutOrder,
  "id" | "order_number" | "invoice_number" | "created_at" | "customer_name" |
  "billing_address" | "delivery_address" | "line_items" | "currency" | "locale" |
  "subtotal" | "discount_amount" | "shipping_amount" | "tax_amount" | "tax_rate" | "total_amount"
>;

type CheckoutAmounts = Pick<CheckoutOrder,
  "subtotal" | "discount_amount" | "shipping_amount" | "tax_amount" | "total_amount"
> & Partial<Pick<CheckoutOrder, "line_items">>;

export class CheckoutInvoiceAmountError extends Error {}

// checkout_orders stores amounts at two decimal places. Integer arithmetic
// avoids 0.1 + 0.2 floating-point discrepancies without changing saved prices.
function cents(amount: number) { return Math.round((amount + Number.EPSILON) * 100); }

/** Never apply today's VAT, exchange rates or catalogue prices to an order. */
export function checkoutInvoiceAmounts(order: CheckoutAmounts) {
  const amounts = {
    subtotal: order.subtotal,
    discount: order.discount_amount,
    delivery: order.shipping_amount,
    tax: order.tax_amount,
    total: order.total_amount,
  };
  if (Object.values(amounts).some(amount => typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) {
    throw new CheckoutInvoiceAmountError("This order has missing or invalid checkout amounts. Review the saved order before generating its invoice.");
  }
  const expected = cents(amounts.subtotal) - cents(amounts.discount) + cents(amounts.tax) + cents(amounts.delivery);
  if (expected !== cents(amounts.total)) {
    throw new CheckoutInvoiceAmountError("The saved checkout amounts do not balance: product cost minus discount plus taxes and delivery must equal the checkout total. Review the order data before sending an invoice.");
  }
  if (order.line_items) {
    const productCost = order.line_items.reduce((sum, item) => sum + cents(invoiceLineSubtotal(item)), 0);
    if (productCost !== cents(amounts.subtotal)) {
      throw new CheckoutInvoiceAmountError("The saved product line amounts do not match the checkout product subtotal. Review the order data before sending an invoice.");
    }
  }
  return amounts;
}

/** Preserve the checkout's rounded/discounted line amount, not unit price × quantity. */
export function invoiceLineSubtotal(item: OrderLineItem) {
  if (!item || !Number.isFinite(item.price) || item.price < 0 || !Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new CheckoutInvoiceAmountError("A product has an invalid checkout unit price or quantity. Review the saved order before generating its invoice.");
  }
  const value = item.line_subtotal ?? (
    item.line_total != null && item.line_tax_amount != null
      ? (cents(item.line_total) - cents(item.line_tax_amount)) / 100
      : cents(item.price * item.quantity) / 100
  );
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new CheckoutInvoiceAmountError("A product has an invalid checkout line amount. Review the saved order before generating its invoice.");
  }
  return value;
}

/** Express the saved line cost on a net-unit basis, including inclusive-price integrations. */
export function invoiceLineUnitPrice(item: OrderLineItem) {
  return invoiceLineSubtotal(item) / item.quantity;
}
