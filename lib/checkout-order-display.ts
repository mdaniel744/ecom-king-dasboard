import type {
  CheckoutInvoiceStatus,
  CheckoutOrderStatus,
  CheckoutPaymentStatus,
  CustomerAddress,
} from "@/lib/types";

export const CHECKOUT_ORDER_STATUS_LABEL: Record<CheckoutOrderStatus, string> = {
  pending_payment: "Pending payment",
  paid: "Paid",
  processing: "Processing",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const CHECKOUT_PAYMENT_STATUS_LABEL: Record<CheckoutPaymentStatus, string> = {
  pending: "Payment pending",
  paid: "Payment received",
  failed: "Payment failed",
  refunded: "Refunded",
};

export const CHECKOUT_INVOICE_STATUS_LABEL: Record<CheckoutInvoiceStatus, string> = {
  not_sent: "Not sent",
  sent: "Sent",
  failed: "Send failed",
};

export const CHECKOUT_ORDER_STATUS_CLASS: Record<CheckoutOrderStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  paid: "bg-blue-100 text-blue-900 hover:bg-blue-100",
  processing: "bg-violet-100 text-violet-900 hover:bg-violet-100",
  ready_to_ship: "bg-cyan-100 text-cyan-900 hover:bg-cyan-100",
  shipped: "bg-indigo-100 text-indigo-900 hover:bg-indigo-100",
  completed: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  cancelled: "bg-red-100 text-red-900 hover:bg-red-100",
};

export function formatOrderMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function addressLines(address: CustomerAddress | null): string[] {
  if (!address) return [];
  return [
    address.full_name,
    address.company,
    address.address_line_1,
    address.address_line_2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(", "),
    address.country,
  ].filter((line): line is string => Boolean(line));
}
