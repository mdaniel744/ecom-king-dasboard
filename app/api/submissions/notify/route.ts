import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendMail, resolveStoreSmtp } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Store } from "@/lib/types";

export const runtime = "nodejs";

const notificationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["inquiry", "checkout_order", "escrow_order"]),
});

const ROUTES = {
  inquiry: {
    table: "inquiries",
    preference: "notify_inquiries",
    destination: "Inquiries",
    path: (id: string) => `/dashboard/inquiries/${id}`,
  },
  checkout_order: {
    table: "checkout_orders",
    preference: "notify_checkout_orders",
    destination: "Orders",
    path: (id: string) => `/dashboard/store-orders/${id}`,
  },
  escrow_order: {
    table: "orders",
    preference: "notify_escrow_orders",
    destination: "Escrow Orders",
    path: (id: string) => `/dashboard/orders/${id}`,
  },
} as const;

type NotificationType = keyof typeof ROUTES;
type StoreNotificationPreference = (typeof ROUTES)[NotificationType]["preference"];
type NotificationStore = Pick<
  Store,
  | "id"
  | "name"
  | "notification_email"
  | "notification_sender_name"
  | "smtp_host"
  | "smtp_port"
  | "smtp_user"
  | "smtp_pass"
  | "smtp_from"
  | StoreNotificationPreference
>;

function matchesSecret(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function text(value: unknown, fallback = "—") {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

function money(row: Record<string, unknown>) {
  const amount = Number(row.total_amount);
  if (!Number.isFinite(amount)) return "—";
  const currency = text(row.currency, "USD");
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function lineItemSummary(row: Record<string, unknown>, type: NotificationType) {
  const rawItems = type === "checkout_order" ? row.line_items : row.products;
  if (!Array.isArray(rawItems) || rawItems.length === 0) return "—";
  return rawItems
    .slice(0, 5)
    .map((item) => {
      if (!item || typeof item !== "object") return "Product";
      const typed = item as Record<string, unknown>;
      const quantity = Number(typed.quantity);
      return `${text(typed.title, "Product")} × ${Number.isFinite(quantity) ? quantity : 1}`;
    })
    .join(", ");
}

function notificationDetails(type: NotificationType, row: Record<string, unknown>) {
  if (type === "inquiry") {
    return {
      heading: "New customer inquiry",
      reference: text(row.inquiry_number, `Inquiry ${String(row.id).slice(0, 8)}`),
      customerName: text(row.customer_name, "Anonymous customer"),
      customerEmail: text(row.customer_email),
      customerPhone: text(row.customer_phone),
      summary: text(row.message, "No message supplied"),
      amount: null,
    };
  }

  if (type === "checkout_order") {
    return {
      heading: "New standard checkout order",
      reference: text(row.order_number, `Order ${String(row.id).slice(0, 8)}`),
      customerName: text(row.customer_name, "Customer"),
      customerEmail: text(row.customer_email),
      customerPhone: text(row.customer_phone),
      summary: lineItemSummary(row, type),
      amount: money(row),
    };
  }

  return {
    heading: "New protected / escrow order",
    reference: `Escrow ${String(row.id).replaceAll("-", "").slice(0, 8).toUpperCase()}`,
    customerName: text(row.buyer_name, text(row.buyer_user_id, "Buyer")),
    customerEmail: text(row.buyer_email),
    customerPhone: "—",
    summary: lineItemSummary(row, type),
    amount: money(row),
  };
}

export async function POST(request: NextRequest) {
  if (
    !matchesSecret(
      request.headers.get("x-webhook-secret"),
      process.env.SUBMISSION_NOTIFICATION_WEBHOOK_SECRET
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = notificationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
  }

  const { id, type } = parsed.data;
  const route = ROUTES[type];
  const { data: submission, error: submissionError } = await supabaseAdmin
    .from(route.table)
    .select("*")
    .eq("id", id)
    .single();

  if (submissionError || !submission) {
    return NextResponse.json({ ok: true, skipped: "not_found" });
  }

  const row = submission as Record<string, unknown>;
  const storeId = typeof row.store_id === "string" ? row.store_id : null;
  if (!storeId) {
    return NextResponse.json({ error: "Submission has no store" }, { status: 422 });
  }

  const { data: storeData, error: storeError } = await supabaseAdmin
    .from("stores")
    .select(
      "id, name, notification_email, notification_sender_name, notify_inquiries, notify_checkout_orders, notify_escrow_orders, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from"
    )
    .eq("id", storeId)
    .single();

  if (storeError || !storeData) {
    return NextResponse.json({ ok: true, skipped: "store_not_found" });
  }

  const store = storeData as NotificationStore;
  if (!store.notification_email) {
    return NextResponse.json({ ok: true, skipped: "no_notification_email" });
  }
  if (!store[route.preference]) {
    return NextResponse.json({ ok: true, skipped: "notification_disabled" });
  }

  const details = notificationDetails(type, row);
  const dashboardUrl = new URL(route.path(id), request.nextUrl.origin).toString();

  try {
    await sendMail({
      to: store.notification_email,
      fromName: store.notification_sender_name || store.name,
      smtp: resolveStoreSmtp(store),
      subject: `${details.heading}: ${details.reference} — ${store.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 620px; color: #18181b;">
          <p style="color: #7c3aed; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;">${escapeHtml(route.destination)}</p>
          <h2 style="margin: 4px 0 6px;">${escapeHtml(details.heading)}</h2>
          <p style="color: #71717a; margin-top: 0;">${escapeHtml(details.reference)} · ${escapeHtml(store.name)}</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 6px 12px 6px 0; color: #71717a;">Customer</td><td style="padding: 6px 0;">${escapeHtml(details.customerName)}</td></tr>
            <tr><td style="padding: 6px 12px 6px 0; color: #71717a;">Email</td><td style="padding: 6px 0;">${escapeHtml(details.customerEmail)}</td></tr>
            <tr><td style="padding: 6px 12px 6px 0; color: #71717a;">Phone</td><td style="padding: 6px 0;">${escapeHtml(details.customerPhone)}</td></tr>
            ${details.amount ? `<tr><td style="padding: 6px 12px 6px 0; color: #71717a;">Total</td><td style="padding: 6px 0; font-weight: 700;">${escapeHtml(details.amount)}</td></tr>` : ""}
            <tr><td style="padding: 6px 12px 6px 0; color: #71717a; vertical-align: top;">${type === "inquiry" ? "Message" : "Products"}</td><td style="padding: 6px 0;">${escapeHtml(details.summary)}</td></tr>
          </table>
          <a href="${escapeHtml(dashboardUrl)}" style="display: inline-block; border-radius: 6px; background: #7c3aed; color: white; padding: 10px 16px; text-decoration: none; font-weight: 600;">Open in ${escapeHtml(route.destination)}</a>
        </div>
      `,
    });
  } catch (error) {
    console.error("Storefront submission notification failed:", error);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, destination: route.destination });
}
