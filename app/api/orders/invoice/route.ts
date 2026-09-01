import { NextRequest, NextResponse } from "next/server";
import { checkoutInvoiceNumber, sendCheckoutInvoiceEmail } from "@/lib/checkout-invoice";
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

  const { data: storeData } = await supabaseAdmin
    .from("stores")
    .select("id, name, notification_email, notification_sender_name")
    .eq("id", order.store_id)
    .single();
  if (!storeData) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const store = storeData as Pick<Store, "id" | "name" | "notification_email" | "notification_sender_name">;
  const [invoiceSettings, paymentSettings] = await Promise.all([
    getInvoiceSettings(store),
    getPaymentSettings(store.id),
  ]);
  if (!invoiceSettings.auto_send) {
    return NextResponse.json({ ok: true, skipped: "store_auto_send_disabled" });
  }

  try {
    await sendCheckoutInvoiceEmail(order, store, invoiceSettings, paymentSettings);
    await supabaseAdmin
      .from("checkout_orders")
      .update({
        invoice_number: checkoutInvoiceNumber(order, invoiceSettings),
        invoice_status: "sent",
        invoice_sent_at: new Date().toISOString(),
      })
      .eq("id", order.id);
  } catch (error) {
    console.error("Automatic order invoice failed:", error);
    await supabaseAdmin
      .from("checkout_orders")
      .update({ invoice_status: "failed" })
      .eq("id", order.id);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
