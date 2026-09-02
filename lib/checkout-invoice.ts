import "server-only";

import { sendMail, resolveStoreSmtp } from "@/lib/mailer";
import { addressLines, formatOrderMoney } from "@/lib/checkout-order-display";
import { defaultInvoiceSettings } from "@/lib/invoice-settings-defaults";
import { defaultPaymentSettings } from "@/lib/payment-settings-defaults";
import type { CheckoutOrder, InvoiceSettings, PaymentSettings, Store } from "@/lib/types";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlLines(value: string | null) {
  return value ? escapeHtml(value).replaceAll("\n", "<br>") : "";
}

export function checkoutInvoiceNumber(
  order: Pick<CheckoutOrder, "order_number" | "invoice_number">,
  settings?: Pick<InvoiceSettings, "invoice_prefix">
) {
  const prefix = settings?.invoice_prefix || "INV";
  return order.invoice_number || `${prefix}-${order.order_number.replace(/^ORD-?/i, "")}`;
}

export async function sendCheckoutInvoiceEmail(
  order: CheckoutOrder,
  store: Pick<
    Store,
    "name" | "notification_sender_name" | "notification_email" | "smtp_host" | "smtp_port" | "smtp_user" | "smtp_pass" | "smtp_from"
  >,
  invoiceSettings?: InvoiceSettings,
  paymentSettings?: PaymentSettings
) {
  const settings =
    invoiceSettings ??
    defaultInvoiceSettings(order.store_id, store.name, store.notification_email);
  const payments = paymentSettings ?? defaultPaymentSettings(order.store_id);
  const invoiceNumber = checkoutInvoiceNumber(order, settings);
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(settings.accent_color)
    ? settings.accent_color
    : "#111827";
  const isModern = settings.template === "modern";
  const isClassic = settings.template === "classic";
  const isCorporate = settings.template === "corporate";
  const fontFamily = settings.font_family === "serif" ? "Georgia,serif" : "Arial,sans-serif";
  const dueDate = new Date(order.created_at);
  dueDate.setDate(dueDate.getDate() + settings.due_days);

  const itemRows = order.line_items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.title)}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatOrderMoney(item.price, order.currency))}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatOrderMoney(item.price * item.quantity, order.currency))}</td>
        </tr>`
    )
    .join("");
  const billing = addressLines(order.billing_address).map(escapeHtml).join("<br>") || "—";
  const delivery = addressLines(order.delivery_address).map(escapeHtml).join("<br>") || "—";
  const logo = settings.show_logo && settings.logo_url
    ? `<img src="${escapeHtml(settings.logo_url)}" alt="${escapeHtml(settings.business_name)}" style="display:block;max-width:180px;max-height:54px;margin-bottom:12px;">`
    : "";
  const businessDetails = [
    settings.business_address ? htmlLines(settings.business_address) : "",
    settings.business_email ? escapeHtml(settings.business_email) : "",
    settings.business_phone ? escapeHtml(settings.business_phone) : "",
    settings.business_website ? escapeHtml(settings.business_website) : "",
    settings.vat_registration_number ? `VAT ID: ${escapeHtml(settings.vat_registration_number)}` : "",
    settings.company_registration_number ? `Company no.: ${escapeHtml(settings.company_registration_number)}` : "",
    settings.tax_id ? `Tax ID: ${escapeHtml(settings.tax_id)}` : "",
  ].filter(Boolean).join("<br>");
  const addressBlocks = [
    settings.show_billing_address
      ? `<div style="flex:1;min-width:220px;"><strong>Billing address</strong><p style="line-height:1.6;">${billing}</p></div>`
      : "",
    settings.show_shipping_address
      ? `<div style="flex:1;min-width:220px;"><strong>Delivery address</strong><p style="line-height:1.6;">${delivery}</p></div>`
      : "",
  ].filter(Boolean).join("");
  const bankPaymentDetails = payments.bank_transfer_enabled
    ? [
        payments.bank_name ? `<strong>${escapeHtml(payments.bank_name)}</strong>` : "",
        payments.bank_account_name ? `Account name: ${escapeHtml(payments.bank_account_name)}` : "",
        payments.bank_account_number ? `Account number: ${escapeHtml(payments.bank_account_number)}` : "",
        payments.bank_currency ? `Currency: ${escapeHtml(payments.bank_currency)}` : "",
        payments.bank_iban ? `IBAN: ${escapeHtml(payments.bank_iban)}` : "",
        payments.bank_swift_bic ? `SWIFT / BIC: ${escapeHtml(payments.bank_swift_bic)}` : "",
        payments.bank_instructions ? htmlLines(payments.bank_instructions) : "",
      ].filter(Boolean).join("<br>")
    : "";
  const paymentTerms = settings.payment_terms || `Payment due within ${settings.due_days} days.`;
  const deliveryTerms = settings.delivery_terms || "Delivery timing will be confirmed with your order.";
  const depositAmount = order.total_amount * (settings.deposit_percentage / 100);
  const managerDetails = [
    settings.account_manager_name ? `<strong>${escapeHtml(settings.account_manager_name)}</strong>` : "",
    settings.account_manager_email ? escapeHtml(settings.account_manager_email) : "",
    settings.account_manager_phone ? escapeHtml(settings.account_manager_phone) : "",
  ].filter(Boolean).join("<br>");

  const headerBackground = isModern ? accentColor : "#ffffff";
  const headerColor = isModern ? "#ffffff" : accentColor;
  const headerBorder = isClassic || isCorporate ? `border-bottom:3px solid ${accentColor};` : "";

  await sendMail({
    to: order.customer_email,
    fromName: store.notification_sender_name || store.name,
    smtp: resolveStoreSmtp(store),
    subject: `Invoice ${invoiceNumber} for order ${order.order_number}`,
    html: `
      <div style="font-family:${fontFamily};max-width:720px;margin:0 auto;color:#111827;border:1px solid #e5e7eb;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:24px;background:${headerBackground};color:${headerColor};${headerBorder}">
          ${isCorporate
            ? `<div><div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">Invoice</div><h1 style="margin:8px 0 0;font-size:26px;">${escapeHtml(invoiceNumber)}</h1><p style="margin:6px 0 0;color:#6b7280;">Issued ${escapeHtml(new Date(order.created_at).toLocaleDateString("en"))}</p></div><div style="text-align:right;">${logo || `<strong style="text-transform:uppercase;letter-spacing:.12em;">${escapeHtml(settings.business_name)}</strong>`}<div style="margin-top:8px;color:#6b7280;">Order ${escapeHtml(order.order_number)}</div></div>`
            : `<div>${logo}<h1 style="margin:0;font-size:28px;">Invoice</h1><p style="margin:6px 0 0;opacity:.78;">${escapeHtml(settings.business_name)}</p></div><div style="text-align:right;"><strong>${escapeHtml(invoiceNumber)}</strong><br><span style="opacity:.78;">Order ${escapeHtml(order.order_number)}</span><br><span style="opacity:.78;">Due ${escapeHtml(dueDate.toLocaleDateString("en"))}</span></div>`}
        </div>
        <div style="padding:24px;">
          ${isCorporate
            ? `${addressBlocks ? `<div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:20px;">${addressBlocks}</div>` : ""}<table role="presentation" style="width:100%;border-collapse:collapse;background:#f9fafb;margin-bottom:24px;"><tr><td style="width:50%;padding:14px;vertical-align:top;"><strong>Invoice details</strong><p style="line-height:1.7;color:#4b5563;margin-bottom:0;">Invoice date: ${escapeHtml(new Date(order.created_at).toLocaleDateString("en"))}<br>Payment terms: ${escapeHtml(paymentTerms)}<br>Delivery: ${escapeHtml(deliveryTerms)}</p></td><td style="width:50%;padding:14px;vertical-align:top;"><strong>Account manager</strong><p style="line-height:1.7;color:#4b5563;margin-bottom:0;">${managerDetails || "Contact details not configured"}</p></td></tr></table>`
            : `<div style="display:flex;gap:24px;justify-content:space-between;flex-wrap:wrap;margin-bottom:24px;"><div><strong>From</strong><p style="line-height:1.6;color:#4b5563;">${escapeHtml(settings.business_name)}${businessDetails ? `<br>${businessDetails}` : ""}</p></div><div><strong>Bill to</strong><p style="line-height:1.6;color:#4b5563;">${billing}</p></div></div>`}
          <p style="margin:0 0 8px;">Hello ${escapeHtml(order.customer_name)},</p>
          <p style="color:#4b5563;">Thank you for your order. Your invoice details are below.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:24px;">
            <thead><tr style="background:${isCorporate ? accentColor : isModern ? `${accentColor}14` : "#f3f4f6"};color:${isCorporate ? "#ffffff" : "#111827"};"><th style="padding:10px;text-align:left;">Product</th><th style="padding:10px;">Qty</th><th style="padding:10px;text-align:right;">Unit price</th><th style="padding:10px;text-align:right;">Total</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <table style="width:100%;max-width:320px;margin:20px 0 20px auto;border-collapse:collapse;">
            <tr><td style="padding:4px;color:#6b7280;">Subtotal</td><td style="padding:4px;text-align:right;">${escapeHtml(formatOrderMoney(order.subtotal, order.currency))}</td></tr>
            <tr><td style="padding:4px;color:#6b7280;">Discount</td><td style="padding:4px;text-align:right;">-${escapeHtml(formatOrderMoney(order.discount_amount, order.currency))}</td></tr>
            <tr><td style="padding:4px;color:#6b7280;">Delivery</td><td style="padding:4px;text-align:right;">${escapeHtml(formatOrderMoney(order.shipping_amount, order.currency))}</td></tr>
            ${settings.show_tax_breakdown ? `<tr><td style="padding:4px;color:#6b7280;">Tax</td><td style="padding:4px;text-align:right;">${escapeHtml(formatOrderMoney(order.tax_amount, order.currency))}</td></tr>` : ""}
            <tr><td style="padding:8px 4px;border-top:2px solid ${accentColor};font-weight:700;color:${accentColor};">Total</td><td style="padding:8px 4px;border-top:2px solid ${accentColor};text-align:right;font-weight:700;color:${accentColor};">${escapeHtml(formatOrderMoney(order.total_amount, order.currency))}</td></tr>
          </table>
          ${settings.deposit_percentage > 0 ? `<div style="display:flex;justify-content:space-between;gap:16px;border:1px solid ${accentColor}55;border-radius:8px;padding:12px 14px;color:${accentColor};font-weight:700;"><span>${settings.deposit_percentage}% deposit required</span><span>${escapeHtml(formatOrderMoney(depositAmount, order.currency))}</span></div>` : ""}
          ${!isCorporate && addressBlocks ? `<div style="display:flex;gap:24px;flex-wrap:wrap;background:#f9fafb;padding:16px;margin-top:20px;">${addressBlocks}</div>` : ""}
          <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;margin-top:22px;">
            <tr>
              ${bankPaymentDetails ? `<td style="width:50%;padding:18px 18px 0 0;vertical-align:top;"><strong style="color:${accentColor};">Bank transfer details</strong><p style="line-height:1.6;color:#4b5563;">${bankPaymentDetails}</p></td>` : ""}
              <td style="width:50%;padding:18px 0 0 18px;vertical-align:top;"><strong style="color:${accentColor};">Terms &amp; instructions</strong><p style="line-height:1.6;color:#4b5563;">${settings.commercial_terms ? htmlLines(settings.commercial_terms) : escapeHtml(paymentTerms)}</p></td>
            </tr>
          </table>
        </div>
        <div style="border-top:2px solid ${accentColor};padding:18px 24px;color:${isCorporate ? "rgba(255,255,255,.76)" : "#6b7280"};background:${isCorporate ? accentColor : "#ffffff"};font-size:11px;line-height:1.6;">
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="width:33%;padding:0 12px 0 0;vertical-align:top;">
                <strong style="color:${isCorporate ? "#ffffff" : "#374151"};">${escapeHtml(settings.business_name)}</strong><br>
                ${settings.company_registration_number ? `Company no. ${escapeHtml(settings.company_registration_number)}<br>` : ""}
                ${settings.vat_registration_number ? `VAT ID ${escapeHtml(settings.vat_registration_number)}<br>` : ""}
                ${settings.tax_id ? `Tax ID ${escapeHtml(settings.tax_id)}` : ""}
              </td>
              <td style="width:34%;padding:0 12px;vertical-align:top;">
                <strong style="color:${isCorporate ? "#ffffff" : "#374151"};">Registered office</strong><br>
                ${settings.business_address ? htmlLines(settings.business_address) : "Registered address not configured"}
              </td>
              <td style="width:33%;padding:0 0 0 12px;vertical-align:top;">
                <strong style="color:${isCorporate ? "#ffffff" : "#374151"};">Contact</strong><br>
                ${settings.business_email ? `${escapeHtml(settings.business_email)}<br>` : ""}
                ${settings.business_phone ? `${escapeHtml(settings.business_phone)}<br>` : ""}
                ${settings.business_website ? escapeHtml(settings.business_website) : ""}
              </td>
            </tr>
          </table>
          ${settings.footer_note ? `<div style="border-top:1px solid ${isCorporate ? "rgba(255,255,255,.22)" : "#e5e7eb"};margin-top:14px;padding-top:12px;text-align:center;color:${isCorporate ? "rgba(255,255,255,.68)" : "#9ca3af"};">${htmlLines(settings.footer_note)}</div>` : ""}
        </div>
      </div>`,
  });

  return invoiceNumber;
}
