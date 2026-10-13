import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendMail, resolveStoreSmtp } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addressLines } from "@/lib/checkout-order-display";
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

function moneyValue(amount: unknown, currency: unknown) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const cur = typeof currency === "string" && currency ? currency : "USD";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: cur }).format(n);
  } catch {
    return `${cur} ${n.toFixed(2)}`;
  }
}

function moneyFromRow(row: Record<string, unknown>) {
  return moneyValue(row.total_amount, row.currency) ?? "—";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function fieldText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "—";
}

function configurationSummary(value: unknown) {
  return Object.entries(asRecord(value))
    .slice(0, 4)
    .map(([key, item]) => `${key.replaceAll("_", " ")}: ${fieldText(item)}`)
    .join(", ");
}

// Rows written before the storefront stopped duplicating everything into `message`
// start with this literal header — detect and pull out just the free-text part so
// old and new rows both render sensibly.
function extractCustomerMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("QUOTE REQUEST")) return trimmed;
  const marker = "CUSTOMER MESSAGE\n";
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return null;
  const extracted = trimmed.slice(idx + marker.length).trim();
  return extracted && extracted !== "No additional message." ? extracted : null;
}

function addressSummary(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const lines = addressLines(address as never);
  return lines.length ? lines.join(", ") : null;
}

// Formats a diecontainers-style delivery_address ({street, house_number, postal_code, city, country}) —
// distinct field names from the checkout_order billing/delivery shape addressLines() expects.
function germanAddressSummary(address: unknown): string | null {
  const addr = asRecord(address);
  const streetLine = [addr.street, addr.house_number]
    .filter((v) => typeof v === "string" && v.trim())
    .join(" ");
  const cityLine = [addr.postal_code, addr.city]
    .filter((v) => typeof v === "string" && v.trim())
    .join(" ");
  const parts = [streetLine, cityLine, typeof addr.country === "string" ? addr.country : null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

type LineItem = {
  name: string;
  url?: string | null;
  sku?: string | null;
  unitPrice?: string | null;
  qty: number;
  lineTotal?: string | null;
};

type DetailRow = { label: string; value: string };

type NotificationDetails = {
  heading: string;
  reference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  lineItems: LineItem[] | null;
  totalLabel: string | null;
  total: string | null;
  extraRows: DetailRow[];
  message: string | null;
};

function lineItemsFromGenericRow(row: Record<string, unknown>, type: NotificationType): LineItem[] | null {
  const rawItems = type === "checkout_order" ? row.line_items : row.products;
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null;
  return rawItems.slice(0, 10).map((item) => {
    if (!item || typeof item !== "object") return { name: "Product", qty: 1 };
    const typed = item as Record<string, unknown>;
    const quantity = Number(typed.quantity);
    const extras = [typed.condition, typed.brand].filter((v) => typeof v === "string" && v);
    const configuration = configurationSummary(typed.attributes);
    const descriptors = [configuration, extras.join(", ")].filter(Boolean).join(" · ");
    return {
      name: text(typed.title, "Product"),
      sku: descriptors || null,
      qty: Number.isFinite(quantity) ? quantity : 1,
      unitPrice: null,
      lineTotal: null,
    };
  });
}

const UNLOADING_METHOD_LABELS: Record<string, string> = {
  self_pickup: "Self pickup",
  delivery_no_unload: "Delivery (no unloading help)",
  delivery_with_unload: "Delivery (with unloading help)",
};

function notificationDetails(type: NotificationType, row: Record<string, unknown>): NotificationDetails {
  if (type === "inquiry") {
    const details = asRecord(row.details);
    const source = typeof details.source === "string" ? details.source : "quote";

    // Flat shape (e.g. STF): details.product_name / details.displayed_unit_price / details.line_total
    const hasFlatProduct = typeof details.product_name === "string" && details.product_name.trim();
    const isFlatQuote = source === "quote" && hasFlatProduct;

    // Nested shape (e.g. diecontainers): details.pricing.{product_title,unit_price,net_subtotal,...},
    // details.quantity top-level. pricing can be null on rows submitted before a price was computable —
    // container_size is the fallback marker that's always present on a real quote row either way.
    const pricing = asRecord(details.pricing);
    const hasContainerSpec = typeof details.container_size === "string" && details.container_size.trim();
    const isNestedQuote =
      !isFlatQuote && source !== "kontakt-form" && (Object.keys(pricing).length > 0 || hasContainerSpec);

    const isQuote = isFlatQuote || isNestedQuote;

    let lineItems: LineItem[] | null = null;
    let totalLabel: string | null = null;
    let total: string | null = null;

    if (isFlatQuote) {
      lineItems = [
        {
          name: text(details.product_name, "Product"),
          url: typeof details.product_url === "string" ? details.product_url : null,
          sku: typeof details.product_slug === "string" ? details.product_slug : null,
          unitPrice: moneyValue(details.displayed_unit_price, details.currency),
          qty: Number(details.quantity) || 1,
          lineTotal: moneyValue(details.line_total, details.currency),
        },
      ];
      totalLabel = details.price_vat_mode === "incl" ? "Total (incl. VAT)" : "Total (excl. VAT)";
      total = moneyValue(details.line_total, details.currency);
    } else if (isNestedQuote && typeof pricing.product_title === "string" && pricing.product_title.trim()) {
      lineItems = [
        {
          name: text(pricing.product_title, "Product"),
          url: null,
          sku: null,
          unitPrice: moneyValue(pricing.unit_price, pricing.currency),
          qty: Number(details.quantity) || 1,
          lineTotal: moneyValue(pricing.net_subtotal, pricing.currency),
        },
      ];
      if (pricing.gross_subtotal != null) {
        totalLabel = "Total (incl. VAT)";
        total = moneyValue(pricing.gross_subtotal, pricing.currency);
      }
      // pricing present but gross_subtotal null (shouldn't happen if unit_price is set, but
      // guards against a partially-populated row): leave total/totalLabel null, table still renders.
    }
    // isNestedQuote but no pricing.product_title (pricing was null/not computed): lineItems stays
    // null — no product table, but heading is still "New quote request" and extraRows below cover
    // the container spec + delivery info so the email still tells the vendor something useful.

    const extraRows: DetailRow[] = [];
    if (text(details.company, "")) extraRows.push({ label: "Company", value: text(details.company) });

    if (isFlatQuote) {
      const addressParts = [details.delivery_address, details.postal_code].filter(
        (v) => typeof v === "string" && v.trim()
      );
      if (addressParts.length) extraRows.push({ label: "Delivery address", value: addressParts.join(", ") });
      if (text(details.country, "")) extraRows.push({ label: "Country", value: text(details.country) });
      if (typeof details.transport_required === "string") {
        extraRows.push({
          label: "Transport",
          value: details.transport_required === "Yes" ? "Delivery requested" : "Customer collection",
        });
      }
      if (text(details.preferred_delivery_date, "")) {
        extraRows.push({ label: "Preferred date", value: text(details.preferred_delivery_date) });
      }
    } else if (isNestedQuote) {
      const spec = [
        details.main_category,
        details.container_size,
        details.container_height,
        details.container_type,
        details.condition,
        details.color,
      ]
        .filter((v) => typeof v === "string" && v.trim())
        .join(", ");
      if (spec) extraRows.push({ label: "Container", value: spec });

      const addrLine = germanAddressSummary(details.delivery_address);
      if (addrLine) extraRows.push({ label: "Delivery address", value: addrLine });
      if (text(details.country, "")) extraRows.push({ label: "Country", value: text(details.country) });

      if (typeof details.unloading_method === "string" && UNLOADING_METHOD_LABELS[details.unloading_method]) {
        extraRows.push({ label: "Delivery option", value: UNLOADING_METHOD_LABELS[details.unloading_method] });
      }
      if (text(details.desired_delivery_date, "")) {
        extraRows.push({ label: "Desired delivery date", value: text(details.desired_delivery_date) });
      }
    } else if (text(details.subject, "")) {
      // Contact-form submissions (e.g. diecontainers' kontakt-form) carry a customer-chosen
      // subject line separate from the free-text message — surface it so it isn't silently lost.
      extraRows.push({ label: "Subject", value: text(details.subject) });
    }

    return {
      heading: isQuote ? "New quote request" : "New contact message",
      reference: text(row.inquiry_number, `Enquiry ${String(row.id).slice(0, 8).toUpperCase()}`),
      customerName: text(row.customer_name, "Anonymous customer"),
      customerEmail: text(row.customer_email),
      customerPhone: text(row.customer_phone),
      lineItems,
      totalLabel,
      total,
      extraRows,
      message: extractCustomerMessage(text(row.message, "")),
    };
  }

  if (type === "checkout_order") {
    const extraRows: DetailRow[] = [];
    const billing = addressSummary(row.billing_address);
    const delivery = addressSummary(row.delivery_address);
    if (billing) extraRows.push({ label: "Billing address", value: billing });
    if (delivery) extraRows.push({ label: "Delivery address", value: delivery });

    return {
      heading: "New standard checkout order",
      reference: text(row.order_number, `Order ${String(row.id).slice(0, 8)}`),
      customerName: text(row.customer_name, "Customer"),
      customerEmail: text(row.customer_email),
      customerPhone: text(row.customer_phone),
      lineItems: lineItemsFromGenericRow(row, type),
      totalLabel: "Total",
      total: moneyFromRow(row),
      extraRows,
      message: typeof row.customer_note === "string" && row.customer_note.trim() ? row.customer_note : null,
    };
  }

  return {
    heading: "New protected / escrow order",
    reference: `Escrow ${String(row.id).replaceAll("-", "").slice(0, 8).toUpperCase()}`,
    customerName: text(row.buyer_name, text(row.buyer_user_id, "Buyer")),
    customerEmail: text(row.buyer_email),
    customerPhone: "—",
    lineItems: lineItemsFromGenericRow(row, type),
    totalLabel: "Total",
    total: moneyFromRow(row),
    extraRows: [],
    message: null,
  };
}

// Email-safe HTML: table-based layout, inline styles only, no CSS variables/flexbox — this has
// to survive Outlook and other clients that strip <style> blocks and ignore modern CSS.
const PALETTES = {
  green: {
    bannerFrom: "#6e9a2e", // lemon-leaning mid green
    bannerTo: "#1f3d26", // forest green
    accentText: "#1f3d26",
    tint: "#f1f6e4",
    tintStrong: "#e3edc9",
    border: "#dde6cc",
    ink: "#1b2415",
    muted: "#5c6a51",
    pageBg: "#eef3e1",
  },
  navy: {
    bannerFrom: "#2a4d7a",
    bannerTo: "#0f2347",
    accentText: "#0f2347",
    tint: "#eef2f8",
    tintStrong: "#dde6f0",
    border: "#ccd8e8",
    ink: "#15213a",
    muted: "#5a6b85",
    pageBg: "#eef1f6",
  },
} as const;

type PaletteName = keyof typeof PALETTES;
type Palette = (typeof PALETTES)[PaletteName];

// Per-store banner color override. Add a line here when a tenant wants a palette other
// than the default green — keyed by store id so it survives store renames.
const STORE_PALETTE_OVERRIDES: Record<string, PaletteName> = {
  "da2c7438-4763-416d-bf2d-d1f5f93b9c5f": "navy", // DIE Container GmbH
};

function resolvePalette(storeId: string): Palette {
  return PALETTES[STORE_PALETTE_OVERRIDES[storeId] ?? "green"];
}

function renderEmailHtml(
  details: NotificationDetails,
  opts: { destination: string; storeName: string; dashboardUrl: string; palette: Palette }
) {
  const { palette } = opts;
  const productRows = details.lineItems
    ? `
      <tr>
        <td colspan="4" style="padding:18px 24px 0;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${palette.accentText};">Requested product</p>
          <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="background:${palette.tint};color:${palette.accentText};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:9px 10px;">Product</td>
              <td style="background:${palette.tint};color:${palette.accentText};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:9px 10px;">Unit price</td>
              <td style="background:${palette.tint};color:${palette.accentText};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:9px 10px;text-align:right;">Qty</td>
              <td style="background:${palette.tint};color:${palette.accentText};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:9px 10px;text-align:right;">Total</td>
            </tr>
            ${details.lineItems
              .map(
                (item) => `
            <tr>
              <td style="padding:10px;border-bottom:1px solid ${palette.border};">
                ${item.url ? `<a href="${escapeHtml(item.url)}" style="color:${palette.ink};font-weight:600;text-decoration:none;border-bottom:1px solid ${palette.border};">${escapeHtml(item.name)}</a>` : `<span style="color:${palette.ink};font-weight:600;">${escapeHtml(item.name)}</span>`}
                ${item.sku ? `<div style="font-size:11px;color:${palette.muted};margin-top:2px;">${escapeHtml(item.sku)}</div>` : ""}
              </td>
              <td style="padding:10px;border-bottom:1px solid ${palette.border};color:${palette.ink};">${escapeHtml(item.unitPrice ?? "—")}</td>
              <td style="padding:10px;border-bottom:1px solid ${palette.border};color:${palette.ink};text-align:right;">${item.qty}</td>
              <td style="padding:10px;border-bottom:1px solid ${palette.border};color:${palette.ink};text-align:right;font-weight:600;">${escapeHtml(item.lineTotal ?? "—")}</td>
            </tr>`
              )
              .join("")}
            ${
              details.total
                ? `<tr>
              <td colspan="3" style="padding:11px 10px;background:${palette.tint};font-weight:700;color:${palette.muted};font-size:11px;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(details.totalLabel ?? "Total")}</td>
              <td style="padding:11px 10px;background:${palette.tint};font-weight:700;color:${palette.ink};text-align:right;">${escapeHtml(details.total)}</td>
            </tr>`
                : ""
            }
          </table>
        </td>
      </tr>`
    : "";

  const baseRows: DetailRow[] = [
    { label: "Name", value: details.customerName },
    { label: "Email", value: details.customerEmail },
    { label: "Phone", value: details.customerPhone },
    ...details.extraRows,
    ...(details.message ? [{ label: "Message", value: details.message }] : []),
  ];

  const detailRowsHtml = baseRows
    .map(
      (row, i) => `
    <tr>
      <td style="padding:11px 14px;${i % 2 === 0 ? `background:${palette.tint};` : ""}width:34%;font-weight:600;color:${palette.muted};font-size:12.5px;vertical-align:top;border-bottom:1px solid ${palette.border};">${escapeHtml(row.label)}</td>
      <td style="padding:11px 14px;${i % 2 === 0 ? `background:${palette.tint};` : ""}color:${palette.ink};white-space:pre-line;border-bottom:1px solid ${palette.border};">${escapeHtml(row.value)}</td>
    </tr>`
    )
    .join("");

  return `
<table role="presentation" width="100%" style="border-collapse:collapse;background:${palette.pageBg};padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="640" style="max-width:640px;width:100%;background:#ffffff;border-collapse:collapse;border:1px solid ${palette.border};border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr>
          <td style="background:${palette.bannerTo};background-image:linear-gradient(135deg, ${palette.bannerFrom}, ${palette.bannerTo});padding:26px 28px;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.8);">${escapeHtml(opts.storeName)} · ${escapeHtml(opts.destination)}</p>
            <h1 style="margin:0 0 6px;font-size:22px;">${escapeHtml(details.heading)}</h1>
            <p style="margin:0;font-size:13px;color:rgba(255,255,255,.85);">${escapeHtml(details.reference)}</p>
          </td>
        </tr>
        ${productRows}
        <tr>
          <td style="padding:20px 24px 4px;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${palette.accentText};">Customer</p>
            <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;">
              ${detailRowsHtml}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 24px 26px;">
            <a href="${escapeHtml(opts.dashboardUrl)}" style="display:inline-block;background:${palette.bannerTo};color:#ffffff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Open in ${escapeHtml(opts.destination)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
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
  const palette = resolvePalette(store.id);

  try {
    await sendMail({
      to: store.notification_email,
      fromName: store.notification_sender_name || store.name,
      smtp: resolveStoreSmtp(store),
      subject: `${details.heading}: ${details.reference} — ${store.name}`,
      html: renderEmailHtml(details, { destination: route.destination, storeName: store.name, dashboardUrl, palette }),
    });
  } catch (error) {
    console.error("Storefront submission notification failed:", error);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, destination: route.destination });
}
