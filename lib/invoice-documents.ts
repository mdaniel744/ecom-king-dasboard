import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isLocalDemoMode } from "@/lib/local-demo";
import { checkoutInvoiceNumber, sendCheckoutInvoiceEmail } from "@/lib/checkout-invoice";
import { invoiceLogoBytes, invoicePdfFilename, renderCheckoutInvoicePdf } from "@/lib/invoice-pdf";
import { normalizeInvoiceLocale } from "@/lib/invoice-i18n";
import { checkoutInvoiceAmounts, CheckoutInvoiceAmountError } from "@/lib/checkout-invoice-amounts";
import { snapshotInvoicePricing, type InvoicePricingSnapshot } from "@/lib/invoice-delivery";
import type { CheckoutOrder, InvoiceSettings, PaymentSettings, Store } from "@/lib/types";

export type InvoiceDocument = {
  id: string; store_id: string; order_id: string; invoice_number: string;
  file_name: string; recipient_email: string; locale: string;
  send_status: "pending" | "sent" | "failed";
  created_at: string; sent_at: string | null;
  pricing_snapshot?: InvoicePricingSnapshot | null;
};
const columns = "id,store_id,order_id,invoice_number,file_name,recipient_email,locale,send_status,created_at,sent_at,pricing_snapshot";
export const INVOICE_ARCHIVE_SETUP_MESSAGE = "PDF archiving is not ready. Run the latest scripts/setup-invoice-documents.sql in Supabase before sending invoices.";
export class InvoiceDeliveryError extends Error {}

export type InvoiceHistoryResult = { documents: InvoiceDocument[]; error: string | null };
async function listInvoiceDocuments(storeId: string, orderId?: string): Promise<InvoiceHistoryResult> {
  // Paged reads avoid Supabase's default 1,000-row response cap; PDF bytes are never listed.
  const documents: InvoiceDocument[] = [];
  for (let from = 0; ; from += 100) {
    let query = supabaseAdmin.from("checkout_invoice_documents").select(columns).eq("store_id", storeId);
    if (orderId) query = query.eq("order_id", orderId);
    const { data, error } = await query.order("created_at", { ascending: false }).range(from, from + 99);
    if (error) return { documents: [], error: ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code)
      ? INVOICE_ARCHIVE_SETUP_MESSAGE : "Invoice files could not be loaded. Please refresh and try again." };
    documents.push(...(data ?? []) as InvoiceDocument[]);
    if ((data?.length ?? 0) < 100) return { documents, error: null };
  }
}

export async function getOrderInvoiceDocuments(storeId: string, orderId: string) {
  return listInvoiceDocuments(storeId, orderId);
}
export async function getStoreInvoiceDocuments(storeId: string) {
  return listInvoiceDocuments(storeId);
}

type InvoiceStore = Pick<Store, "id" | "name" | "notification_sender_name" | "notification_email" |
  "smtp_host" | "smtp_port" | "smtp_user" | "smtp_pass" | "smtp_from">;

/** Archive BEFORE emailing. A failed resend never deletes earlier sent PDFs. */
export async function deliverCheckoutInvoice(
  order: CheckoutOrder, store: InvoiceStore, settings: InvoiceSettings, payments: PaymentSettings,
  options: { automatic?: boolean; pricingBasis?: InvoicePricingSnapshot["basis"]; checkoutTotal?: number } = {}
) {
  if (order.store_id !== store.id || settings.store_id !== store.id || payments.store_id !== store.id) {
    throw new InvoiceDeliveryError("Invoice ownership does not match this store.");
  }
  try { checkoutInvoiceAmounts(order); }
  catch (error) {
    if (error instanceof CheckoutInvoiceAmountError) throw new InvoiceDeliveryError(error.message);
    throw error;
  }
  const id = randomUUID(), createdAt = new Date().toISOString();
  const invoiceNumber = checkoutInvoiceNumber(order, settings);
  const fileName = invoicePdfFilename(invoiceNumber);
  const pdf = await renderCheckoutInvoicePdf(order, settings, payments, invoiceNumber, createdAt,
    await invoiceLogoBytes(settings, store.id));
  if (pdf.length > 5 * 1024 * 1024) throw new InvoiceDeliveryError("The invoice PDF exceeds the 5 MB limit. Reduce the logo or order size.");
  const { error: archiveError } = await supabaseAdmin.from("checkout_invoice_documents").insert({
    id, store_id: store.id, order_id: order.id, invoice_number: invoiceNumber,
    file_name: fileName, pdf_base64: pdf.toString("base64"), recipient_email: order.customer_email,
    locale: normalizeInvoiceLocale(order.locale), send_status: "pending", created_at: createdAt, sent_at: null,
    automatic: options.automatic ?? false,
    pricing_snapshot: snapshotInvoicePricing(order, options.pricingBasis, options.checkoutTotal),
  });
  if (archiveError) throw new InvoiceDeliveryError(archiveError.code === "23505"
    ? "An invoice send is already in progress or awaiting confirmation. Check the invoice history before retrying."
    : INVOICE_ARCHIVE_SETUP_MESSAGE);
  try {
    if (!isLocalDemoMode) await sendCheckoutInvoiceEmail(order, store, settings, payments, {
      filename: fileName, content: pdf, issuedAt: createdAt,
    });
  } catch {
    const { error } = await supabaseAdmin.from("checkout_invoice_documents").update({ send_status: "failed" })
      .eq("id", id).eq("store_id", store.id).eq("order_id", order.id);
    if (!order.invoice_sent_at) await supabaseAdmin.from("checkout_orders").update({ invoice_status: "failed" })
      .eq("id", order.id).eq("store_id", store.id);
    throw new InvoiceDeliveryError(error
      ? "Email sending failed and its status could not be saved. Check the invoice history before retrying."
      : "The invoice email could not be sent. Its PDF is saved in the order history. Check email settings and try again.");
  }
  const sentAt = new Date().toISOString();
  const { error: sentError } = await supabaseAdmin.from("checkout_invoice_documents")
    .update({ send_status: "sent", sent_at: sentAt }).eq("id", id).eq("store_id", store.id).eq("order_id", order.id);
  // Do not mark a delivered email as failed or automatically send another copy if the DB failed.
  if (sentError) throw new InvoiceDeliveryError("The email was accepted, but delivery confirmation could not be saved. The PDF is archived; check email logs before retrying.");
  const { error: orderError } = await supabaseAdmin.from("checkout_orders").update({
    invoice_number: invoiceNumber, invoice_status: "sent", invoice_sent_at: sentAt,
  }).eq("id", order.id).eq("store_id", store.id);
  if (orderError) throw new InvoiceDeliveryError("The invoice was sent and archived, but the order summary could not be updated. Check the invoice history before retrying.");
  return { invoiceNumber, documentId: id };
}
