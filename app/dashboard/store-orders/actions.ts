"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deliverCheckoutInvoice, getOrderInvoiceDocuments, InvoiceDeliveryError } from "@/lib/invoice-documents";
import { canEditInvoiceDelivery, prepareInvoiceDelivery, restoreInvoicePricing } from "@/lib/invoice-delivery";
import { CheckoutInvoiceAmountError } from "@/lib/checkout-invoice-amounts";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { getPaymentSettings } from "@/lib/payment-settings";
import { validate, validateId } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import type { CheckoutOrder } from "@/lib/types";

const orderManagementSchema = z.object({
  orderId: z.string().uuid(),
  orderStatus: z.enum([
    "pending_payment",
    "paid",
    "processing",
    "ready_to_ship",
    "shipped",
    "completed",
    "cancelled",
  ]),
  paymentStatus: z.enum(["pending", "paid", "failed", "refunded"]),
  trackingNumber: z.string().trim().max(200).nullable(),
  adminNotes: z.string().trim().max(5000, "Notes are too long").nullable(),
});

function revalidateOrder(orderId: string) {
  revalidatePath("/dashboard/store-orders");
  revalidatePath(`/dashboard/store-orders/${orderId}`);
  revalidatePath("/dashboard/invoices");
}

export async function updateCheckoutOrder(
  orderId: string,
  values: {
    orderStatus: string;
    paymentStatus: string;
    trackingNumber: string;
    adminNotes: string;
  }
): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const fields = validate(orderManagementSchema, {
      orderId,
      orderStatus: values.orderStatus,
      paymentStatus: values.paymentStatus,
      trackingNumber: values.trackingNumber.trim() || null,
      adminNotes: values.adminNotes.trim() || null,
    });

    const { error } = await supabaseAdmin
      .from("checkout_orders")
      .update({
        order_status: fields.orderStatus,
        payment_status: fields.paymentStatus,
        tracking_number: fields.trackingNumber,
        admin_notes: fields.adminNotes,
      })
      .eq("id", fields.orderId)
      .eq("store_id", store.id);

    if (error) throw error;
    revalidateOrder(fields.orderId);
    return ok();
  } catch (error) {
    return toActionResult(error);
  }
}

const invoiceDeliverySchema = z.object({
  deliveryFee: z.number().finite().min(0).max(1_000_000_000),
  vatRate: z.number().finite().min(0).max(100),
  expectedUpdatedAt: z.string().min(1).max(100),
}).strict();

export async function sendCheckoutOrderInvoice(orderId: string, pricing?: {
  deliveryFee: number; vatRate: number; expectedUpdatedAt: string;
}): Promise<ActionResult> {
  const store = await getCurrentStore();
  try {
    orderId = validateId(orderId);
    const fields = pricing === undefined ? undefined : validate(invoiceDeliverySchema, pricing);
    const { data, error } = await supabaseAdmin
      .from("checkout_orders")
      .select("*")
      .eq("id", orderId)
      .eq("store_id", store.id)
      .single();

    if (error || !data) {
      return { success: false, error: "Order not found.", fieldErrors: {} };
    }

    const order = data as CheckoutOrder;
    if (fields && !canEditInvoiceDelivery(order)) {
      throw new InvoiceDeliveryError("Delivery fees cannot be changed on paid, refunded, completed or cancelled orders.");
    }
    if (fields && fields.expectedUpdatedAt !== order.updated_at) {
      throw new InvoiceDeliveryError("This order changed while you were editing. Refresh and review the invoice before sending.");
    }
    const history = await getOrderInvoiceDocuments(store.id, order.id);
    if (history.error) throw new InvoiceDeliveryError(history.error);
    const lastPricing = history.documents.find(document => document.send_status === "sent")?.pricing_snapshot;
    const invoice = fields ? prepareInvoiceDelivery(order, fields.deliveryFee, fields.vatRate) : restoreInvoicePricing(order, lastPricing);
    const [invoiceSettings, paymentSettings] = await Promise.all([
      getInvoiceSettings(store),
      getPaymentSettings(store.id),
    ]);
    await deliverCheckoutInvoice(invoice, store, invoiceSettings, paymentSettings, {
      pricingBasis: fields ? "items_and_delivery" : lastPricing?.basis ?? "checkout",
      checkoutTotal: order.total_amount,
    });
    revalidateOrder(order.id);
    return ok();
  } catch (error) {
    revalidateOrder(orderId);
    if (error instanceof InvoiceDeliveryError || error instanceof CheckoutInvoiceAmountError) {
      return { success: false, error: error.message, fieldErrors: {} };
    }
    return toActionResult(error);
  }
}
