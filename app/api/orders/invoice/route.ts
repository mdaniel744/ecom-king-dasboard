import { NextRequest, NextResponse } from "next/server";
import { deliverCheckoutInvoice, getOrderInvoiceDocuments } from "@/lib/invoice-documents";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { getPaymentSettings } from "@/lib/payment-settings";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validateId } from "@/lib/validation";
import type { CheckoutOrder, Store } from "@/lib/types";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.ORDER_INVOICE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({ id: null }));
  let orderId: string;
  try {
    orderId = validateId(body.id);
  } catch {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const { data } = await supabaseAdmin
    .from("checkout_orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (!data) return NextResponse.json({ ok: true, skipped: "not_found" });

  const order = data as CheckoutOrder;
  if (!order.auto_invoice) return NextResponse.json({ ok: true, skipped: "disabled" });
  if (order.invoice_status === "sent") {
    return NextResponse.json({ ok: true, skipped: "already_sent" });
  }
  const history = await getOrderInvoiceDocuments(order.store_id, order.id);
  if (history.error) return NextResponse.json({ error: "Invoice archive unavailable" }, { status: 503 });
  if (history.documents.some(document => document.send_status === "sent")) {
    return NextResponse.json({ ok: true, skipped: "already_archived" });
  }

  const { data: storeData } = await supabaseAdmin
    .from("stores")
    .select("id, name, notification_email, notification_sender_name, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from")
    .eq("id", order.store_id)
    .single();
  if (!storeData) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const store = storeData as Pick<
    Store,
    "id" | "name" | "notification_email" | "notification_sender_name" | "smtp_host" | "smtp_port" | "smtp_user" | "smtp_pass" | "smtp_from"
  >;
  const [invoiceSettings, paymentSettings] = await Promise.all([
    getInvoiceSettings(store),
    getPaymentSettings(store.id),
  ]);
  if (!invoiceSettings.auto_send) {
    return NextResponse.json({ ok: true, skipped: "store_auto_send_disabled" });
  }

  try {
    await deliverCheckoutInvoice(order, store, invoiceSettings, paymentSettings, { automatic: true });
  } catch (error) {
    console.error("Automatic order invoice failed:", error);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
