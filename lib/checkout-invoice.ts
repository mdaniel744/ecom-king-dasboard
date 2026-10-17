import "server-only";

import { sendMail, resolveStoreSmtp } from "@/lib/mailer";
import { addressLines, formatOrderMoney } from "@/lib/checkout-order-display";
import { defaultInvoiceSettings } from "@/lib/invoice-settings-defaults";
import { defaultPaymentSettings } from "@/lib/payment-settings-defaults";
import { bankTransferForCurrency } from "@/lib/payment-currency";
import { getInvoiceStrings, normalizeInvoiceLocale } from "@/lib/invoice-i18n";
import { invoiceVatLabel } from "@/lib/invoice-vat";
import { checkoutInvoiceAmounts, invoiceLineSubtotal, invoiceLineUnitPrice } from "@/lib/checkout-invoice-amounts";
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
  paymentSettings?: PaymentSettings,
  pdf?: { filename: string; content: Buffer; issuedAt: string }
) {
  const amounts = checkoutInvoiceAmounts(order);
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
  const issuedAt = pdf?.issuedAt || order.created_at;
  const dueDate = new Date(issuedAt);
  dueDate.setUTCDate(dueDate.getUTCDate() + settings.due_days);
  const locale = normalizeInvoiceLocale(order.locale);
  const invoiceDate = new Date(issuedAt).toLocaleDateString(locale, { timeZone: "UTC" });
  const t = getInvoiceStrings(locale);
  const money = (amount: number, currency: string) => formatOrderMoney(amount, currency, locale);

  const itemRows = order.line_items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.title)}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(money(invoiceLineUnitPrice(item), order.currency))}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(money(invoiceLineSubtotal(item), order.currency))}</td>
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
    settings.vat_registration_number ? `${t.vatId}: ${escapeHtml(settings.vat_registration_number)}` : "",
    settings.company_registration_number ? `${t.companyNo}: ${escapeHtml(settings.company_registration_number)}` : "",
    settings.tax_id ? `${t.taxId}: ${escapeHtml(settings.tax_id)}` : "",
  ].filter(Boolean).join("<br>");
  const addressBlocks = [
    settings.show_billing_address
      ? `<div style="flex:1;min-width:220px;"><strong>${t.billingAddress}</strong><p style="line-height:1.6;">${billing}</p></div>`
      : "",
    settings.show_shipping_address
      ? `<div style="flex:1;min-width:220px;"><strong>${t.deliveryAddress}</strong><p style="line-height:1.6;">${delivery}</p></div>`
      : "",
  ].filter(Boolean).join("");
  const bankCurrency = bankTransferForCurrency(payments, order.currency);
  const bankPaymentDetails = payments.bank_transfer_enabled && bankCurrency.supported
    ? [
        payments.bank_name ? `<strong>${escapeHtml(payments.bank_name)}</strong>` : "",
        payments.bank_account_name ? `${t.accountName}: ${escapeHtml(payments.bank_account_name)}` : "",
        payments.bank_account_number ? `${t.accountNumber}: ${escapeHtml(payments.bank_account_number)}` : "",
        `${t.transferCurrency}: ${escapeHtml(order.currency)}`,
        payments.bank_iban ? `${t.iban}: ${escapeHtml(payments.bank_iban)}` : "",
        payments.bank_swift_bic ? `${t.swiftBic}: ${escapeHtml(payments.bank_swift_bic)}` : "",
        bankCurrency.instructions
          ? htmlLines(bankCurrency.instructions)
          : payments.bank_instructions
            ? htmlLines(payments.bank_instructions)
            : "",
      ].filter(Boolean).join("<br>")
    : "";
  const bankPaymentUnavailable = payments.bank_transfer_enabled && !bankCurrency.supported
    ? t.bankCurrencyUnavailable(
        escapeHtml(order.currency),
        escapeHtml(settings.business_email || store.notification_email || store.name)
      )
    : "";
  const paymentTerms = settings.payment_terms || t.defaultPaymentTerms(settings.due_days);
  const deliveryTerms = settings.delivery_terms || t.defaultDeliveryTerms;
  const depositAmount = amounts.total * (settings.deposit_percentage / 100);
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
    subject: t.invoiceSubject(invoiceNumber, order.order_number),
    attachments: pdf ? [{ filename: pdf.filename, content: pdf.content, contentType: "application/pdf" }] : undefined,
    html: `
      <div style="font-family:${fontFamily};max-width:720px;margin:0 auto;color:#111827;border:1px solid #e5e7eb;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:24px;background:${headerBackground};color:${headerColor};${headerBorder}">
          ${isCorporate
            ? `<div><div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">${t.invoiceWord}</div><h1 style="margin:8px 0 0;font-size:26px;">${escapeHtml(invoiceNumber)}</h1><p style="margin:6px 0 0;color:#6b7280;">${t.issued} ${escapeHtml(invoiceDate)}</p></div><div style="text-align:right;">${logo || `<strong style="text-transform:uppercase;letter-spacing:.12em;">${escapeHtml(settings.business_name)}</strong>`}<div style="margin-top:8px;color:#6b7280;">${t.order} ${escapeHtml(order.order_number)}</div></div>`
            : `<div>${logo}<h1 style="margin:0;font-size:28px;">${t.invoiceWord}</h1><p style="margin:6px 0 0;opacity:.78;">${escapeHtml(settings.business_name)}</p></div><div style="text-align:right;"><strong>${escapeHtml(invoiceNumber)}</strong><br><span style="opacity:.78;">${t.order} ${escapeHtml(order.order_number)}</span><br><span style="opacity:.78;">${t.due} ${escapeHtml(dueDate.toLocaleDateString(locale, { timeZone: "UTC" }))}</span></div>`}
        </div>
        <div style="padding:24px;">
          ${isCorporate
            ? `${addressBlocks ? `<div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:20px;">${addressBlocks}</div>` : ""}<table role="presentation" style="width:100%;border-collapse:collapse;background:#f9fafb;margin-bottom:24px;"><tr><td style="width:50%;padding:14px;vertical-align:top;"><strong>${t.invoiceDetails}</strong><p style="line-height:1.7;color:#4b5563;margin-bottom:0;">${t.invoiceDate}: ${escapeHtml(invoiceDate)}<br>${t.paymentTermsLabel}: ${escapeHtml(paymentTerms)}<br>${t.deliveryLabel}: ${escapeHtml(deliveryTerms)}</p></td><td style="width:50%;padding:14px;vertical-align:top;"><strong>${t.accountManager}</strong><p style="line-height:1.7;color:#4b5563;margin-bottom:0;">${managerDetails || t.contactNotConfigured}</p></td></tr></table>`
            : `<div style="display:flex;gap:24px;justify-content:space-between;flex-wrap:wrap;margin-bottom:24px;"><div><strong>${t.from}</strong><p style="line-height:1.6;color:#4b5563;">${escapeHtml(settings.business_name)}${businessDetails ? `<br>${businessDetails}` : ""}</p></div><div><strong>${t.billTo}</strong><p style="line-height:1.6;color:#4b5563;">${billing}</p></div></div>`}
          <p style="margin:0 0 8px;">${t.greeting(escapeHtml(order.customer_name))}</p>
          <p style="color:#4b5563;">${t.thankYou}</p>
          <table style="width:100%;border-collapse:collapse;margin-top:24px;">
            <thead><tr style="background:${isCorporate ? accentColor : isModern ? `${accentColor}14` : "#f3f4f6"};color:${isCorporate ? "#ffffff" : "#111827"};"><th style="padding:10px;text-align:left;">${t.product}</th><th style="padding:10px;">${t.qty}</th><th style="padding:10px;text-align:right;">${t.unitPrice}</th><th style="padding:10px;text-align:right;">${t.subtotal}</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <table style="width:100%;max-width:320px;margin:20px 0 20px auto;border-collapse:collapse;">
            <tr><td style="padding:4px;color:#6b7280;">${t.subtotal}</td><td style="padding:4px;text-align:right;">${escapeHtml(money(amounts.subtotal, order.currency))}</td></tr>
            <tr><td style="padding:4px;color:#6b7280;">${t.discount}</td><td style="padding:4px;text-align:right;">${escapeHtml(money(amounts.discount ? -amounts.discount : 0, order.currency))}</td></tr>
            <tr><td style="padding:4px;color:#6b7280;">${t.deliveryLabel}</td><td style="padding:4px;text-align:right;">${escapeHtml(money(amounts.delivery, order.currency))}</td></tr>
            <tr><td style="padding:4px;color:#6b7280;">${escapeHtml(invoiceVatLabel(t.tax, order.tax_rate, locale))}</td><td style="padding:4px;text-align:right;">${escapeHtml(money(amounts.tax, order.currency))}</td></tr>
            <tr><td style="padding:8px 4px;border-top:2px solid ${accentColor};font-weight:700;color:${accentColor};">${t.total}</td><td style="padding:8px 4px;border-top:2px solid ${accentColor};text-align:right;font-weight:700;color:${accentColor};">${escapeHtml(money(amounts.total, order.currency))}</td></tr>
          </table>
          ${settings.deposit_percentage > 0 ? `<div style="display:flex;justify-content:space-between;gap:16px;border:1px solid ${accentColor}55;border-radius:8px;padding:12px 14px;color:${accentColor};font-weight:700;"><span>${t.depositRequired(settings.deposit_percentage)}</span><span>${escapeHtml(money(depositAmount, order.currency))}</span></div>` : ""}
          ${!isCorporate && addressBlocks ? `<div style="display:flex;gap:24px;flex-wrap:wrap;background:#f9fafb;padding:16px;margin-top:20px;">${addressBlocks}</div>` : ""}
          <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;margin-top:22px;">
            <tr>
              ${bankPaymentDetails ? `<td style="width:50%;padding:18px 18px 0 0;vertical-align:top;"><strong style="color:${accentColor};">${t.bankTransferDetails}</strong><p style="line-height:1.6;color:#4b5563;">${bankPaymentDetails}</p></td>` : ""}
              <td style="width:50%;padding:18px 0 0 18px;vertical-align:top;"><strong style="color:${accentColor};">${t.termsAndInstructions}</strong><p style="line-height:1.6;color:#4b5563;">${settings.commercial_terms ? htmlLines(settings.commercial_terms) : escapeHtml(paymentTerms)}</p></td>
            </tr>
          </table>
          ${bankPaymentUnavailable ? `<div style="margin-top:16px;padding:12px 14px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;"><strong>${t.paymentSetupRequired}</strong><br>${bankPaymentUnavailable}</div>` : ""}
        </div>
        <div style="border-top:2px solid ${accentColor};padding:18px 24px;color:${isCorporate ? "rgba(255,255,255,.76)" : "#6b7280"};background:${isCorporate ? accentColor : "#ffffff"};font-size:11px;line-height:1.6;">
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="width:33%;padding:0 12px 0 0;vertical-align:top;">
                <strong style="color:${isCorporate ? "#ffffff" : "#374151"};">${escapeHtml(settings.business_name)}</strong><br>
                ${settings.company_registration_number ? `${t.companyNo} ${escapeHtml(settings.company_registration_number)}<br>` : ""}
                ${settings.vat_registration_number ? `${t.vatId} ${escapeHtml(settings.vat_registration_number)}<br>` : ""}
                ${settings.tax_id ? `${t.taxId} ${escapeHtml(settings.tax_id)}` : ""}
              </td>
              <td style="width:34%;padding:0 12px;vertical-align:top;">
                <strong style="color:${isCorporate ? "#ffffff" : "#374151"};">${t.registeredOffice}</strong><br>
                ${settings.business_address ? htmlLines(settings.business_address) : t.registeredAddressNotConfigured}
              </td>
              <td style="width:33%;padding:0 0 0 12px;vertical-align:top;">
                <strong style="color:${isCorporate ? "#ffffff" : "#374151"};">${t.contact}</strong><br>
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
