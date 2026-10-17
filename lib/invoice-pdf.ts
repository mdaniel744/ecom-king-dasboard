import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { addressLines, formatOrderMoney } from "@/lib/checkout-order-display";
import { getInvoiceStrings, normalizeInvoiceLocale } from "@/lib/invoice-i18n";
import { invoiceVatLabel } from "@/lib/invoice-vat";
import { checkoutInvoiceAmounts, invoiceLineSubtotal, invoiceLineUnitPrice } from "@/lib/checkout-invoice-amounts";
import { bankTransferForCurrency } from "@/lib/payment-currency";
import type { CheckoutOrder, InvoiceSettings, PaymentSettings } from "@/lib/types";

export function invoicePdfFilename(number: string) {
  return `${number.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "invoice"}.pdf`;
}

/** No arbitrary URL fetching: logos must come from this project's store-images bucket. */
export async function invoiceLogoBytes(settings: InvoiceSettings, storeId: string) {
  if (!settings.show_logo || !settings.logo_url || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  try {
    const url = new URL(settings.logo_url);
    const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (url.origin !== project.origin || url.protocol !== "https:" ||
      !url.pathname.startsWith(`/storage/v1/object/public/store-images/${storeId}/`)) return;
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok || !response.body) return;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2 * 1024 * 1024) { await reader.cancel(); return; }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch {
    // A missing/unsupported logo must not stop an otherwise valid invoice.
    return;
  }
}

/** Render once at send time. Downloading uses the archived bytes, never current settings. */
export async function renderCheckoutInvoicePdf(
  order: CheckoutOrder,
  settings: InvoiceSettings,
  payments: PaymentSettings,
  invoiceNumber: string,
  issuedAt: string,
  logo?: Uint8Array
): Promise<Buffer> {
  const amounts = checkoutInvoiceAmounts(order);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const family = settings.font_family === "serif" ? "DejaVuSerif" : "DejaVuSans";
  const fontPath = path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf");
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(path.join(fontPath, `${family}.ttf`)),
    readFile(path.join(fontPath, `${family}-Bold.ttf`)),
  ]);
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const supported = new Set(regular.getCharacterSet());
  // Remove control characters; unsupported glyphs are visible question marks, not broken PDFs.
  const clean = (text: unknown) => Array.from(String(text ?? "").normalize("NFC")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/[\u2010-\u2015]/g, "-"))
    .map(char => char === "\n" || supported.has(char.codePointAt(0)!) ? char : "?").join("");
  const locale = normalizeInvoiceLocale(order.locale);
  const t = getInvoiceStrings(locale);
  const money = (amount: number) => clean(formatOrderMoney(amount, order.currency, locale));
  const hex = /^#[\da-f]{6}$/i.test(settings.accent_color) ? settings.accent_color : "#111827";
  const accent = rgb(...[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]);
  const ink = rgb(.09, .12, .17), muted = rgb(.37, .41, .46), light = rgb(.94, .95, .97);
  const width = 595.28, height = 841.89, left = 42, right = width - 42, bottom = 62;
  let page = doc.addPage([width, height]);
  let y = height - 45;
  function line(text: string, x: number, top: number, size = 9, font = regular, color = ink) {
    page.drawText(clean(text), { x, y: top - size, size, font, color });
  }
  function rule(top: number, color = light) {
    page.drawLine({ start: { x: left, y: top }, end: { x: right, y: top }, thickness: 1, color });
  }
  function newPage() {
    page = doc.addPage([width, height]);
    y = height - 40;
    line(`${t.invoiceWord} ${invoiceNumber}`, left, y, 10, bold, accent);
    y -= 26; rule(y); y -= 18;
  }
  const ensure = (space: number) => { if (y - space < bottom) newPage(); };
  function wrap(value: unknown, maxWidth: number, size = 9, font: PDFFont = regular) {
    const lines: string[] = [];
    for (const paragraph of clean(value).split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (font.widthOfTextAtSize(`${current} ${word}`.trim(), size) <= maxWidth) {
          current = `${current} ${word}`.trim(); continue;
        }
        if (current) lines.push(current);
        current = "";
        for (const char of word) {
          if (current && font.widthOfTextAtSize(current + char, size) > maxWidth) {
            lines.push(current); current = "";
          }
          current += char;
        }
      }
      lines.push(current);
    }
    return lines;
  }
  function block(value: unknown, size = 9, font = regular, color = ink) {
    for (const text of wrap(value, right - left, size, font)) {
      ensure(size + 6); line(text, left, y, size, font, color); y -= size + 5;
    }
  }
  function heading(text: string) { ensure(40); y -= 12; block(text, 10, bold, accent); y -= 3; }
  function columns(groups: { title: string; text: string }[]) {
    const gap = 22, colWidth = (right - left - gap * (groups.length - 1)) / groups.length;
    const lines = groups.map(group => [
      ...wrap(group.title, colWidth, 9, bold).map(text => ({ text, font: bold })),
      ...wrap(group.text || "-", colWidth).map(text => ({ text, font: regular })),
    ]);
    const count = Math.max(...lines.map(group => group.length));
    ensure(Math.min(count * 14 + 15, 120));
    for (let i = 0; i < count; i++) {
      ensure(14);
      lines.forEach((group, j) => { if (group[i]) line(group[i].text, left + j * (colWidth + gap), y, 9, group[i].font); });
      y -= 14;
    }
    y -= 14;
  }

  let embeddedLogo;
  if (logo) {
    try { embeddedLogo = logo[0] === 0x89 ? await doc.embedPng(logo) : await doc.embedJpg(logo); } catch { /* text branding fallback */ }
  }
  if (settings.template === "modern") {
    page.drawRectangle({ x: 0, y: height - 13, width, height: 13, color: accent });
  }
  if (embeddedLogo) {
    const scale = Math.min(150 / embeddedLogo.width, 48 / embeddedLogo.height);
    page.drawImage(embeddedLogo, { x: left, y: y - embeddedLogo.height * scale,
      width: embeddedLogo.width * scale, height: embeddedLogo.height * scale });
    y -= 60;
  }
  block(settings.business_name, 18, bold, accent);
  y -= 12;
  block(`${t.invoiceWord} ${invoiceNumber}`, 21, bold, accent);
  const issueDate = new Date(issuedAt), dueDate = new Date(issuedAt);
  dueDate.setUTCDate(dueDate.getUTCDate() + settings.due_days);
  const date = (value: Date) => value.toLocaleDateString(locale, { timeZone: "UTC" });
  block(`${t.issued}: ${date(issueDate)}    ${t.due}: ${date(dueDate)}`, 9, regular, muted);
  block(`${t.order}: ${order.order_number}`, 9, regular, muted);
  y -= 14; rule(y, accent); y -= 20;
  const addresses = [];
  if (settings.show_billing_address) addresses.push({ title: t.billingAddress,
    text: addressLines(order.billing_address).join("\n") || `${order.customer_name}\n${order.customer_email}` });
  if (settings.show_shipping_address) addresses.push({ title: t.deliveryAddress, text: addressLines(order.delivery_address).join("\n") });
  if (addresses.length) columns(addresses);

  function tableHeader() {
    ensure(45);
    page.drawRectangle({ x: left, y: y - 27, width: right - left, height: 27, color: light });
    line(t.product, left + 8, y - 7, 8, bold);
    line(t.qty, 317, y - 7, 8, bold);
    line(t.unitPrice, 363, y - 7, Math.min(8, 91 / bold.widthOfTextAtSize(t.unitPrice, 1)), bold);
    line(t.subtotal, 468, y - 7, 8, bold);
    y -= 36;
  }
  tableHeader();
  for (const item of order.line_items) {
    const titleLines = wrap(item.title, 255);
    if (item.sku) titleLines.push(...wrap(`SKU: ${item.sku}`, 255, 8));
    for (let i = 0; i < titleLines.length; i++) {
      if (y - 17 < bottom) { newPage(); tableHeader(); }
      line(titleLines[i], left + 8, y, 9);
      if (i === 0) {
        const cells = [String(item.quantity), money(invoiceLineUnitPrice(item)), money(invoiceLineSubtotal(item))];
        [347, 454, right - 8].forEach((edge, j) => {
          const size = Math.min(8.5, 85 / Math.max(1, regular.widthOfTextAtSize(cells[j], 1)));
          line(cells[j], edge - regular.widthOfTextAtSize(cells[j], size), y, size);
        });
      }
      y -= 15;
    }
    y -= 9; rule(y); y -= 12;
  }
  ensure(145); y -= 5;
  const totals: [string, number][] = [
    [t.subtotal, amounts.subtotal], [t.discount, amounts.discount ? -amounts.discount : 0],
    [t.deliveryLabel, amounts.delivery], [invoiceVatLabel(t.tax, order.tax_rate, locale), amounts.tax],
    [t.total, amounts.total],
  ];
  for (const [label, amount] of totals) {
    const isTotal = label === t.total;
    if (isTotal) { rule(y + 4, accent); y -= 6; }
    line(label, 285, y, 9, isTotal ? bold : regular, isTotal ? accent : muted);
    const value = money(amount);
    line(value, right - (isTotal ? bold : regular).widthOfTextAtSize(value, 10), y, 10, isTotal ? bold : regular);
    y -= 22;
  }
  if (settings.deposit_percentage > 0) {
    block(`${t.depositRequired(settings.deposit_percentage)}: ${money(amounts.total * settings.deposit_percentage / 100)}`, 10, bold, accent);
  }
  const paymentTerms = settings.payment_terms || t.defaultPaymentTerms(settings.due_days);
  heading(t.termsAndInstructions);
  block(settings.commercial_terms || paymentTerms);
  block(`${t.deliveryLabel}: ${settings.delivery_terms || t.defaultDeliveryTerms}`);
  const bank = bankTransferForCurrency(payments, order.currency);
  if (payments.bank_transfer_enabled) {
    heading(t.bankTransferDetails);
    if (bank.supported) {
      block([
        payments.bank_name, payments.bank_account_name && `${t.accountName}: ${payments.bank_account_name}`,
        payments.bank_account_number && `${t.accountNumber}: ${payments.bank_account_number}`,
        `${t.transferCurrency}: ${order.currency}`,
        payments.bank_iban && `${t.iban}: ${payments.bank_iban}`,
        payments.bank_swift_bic && `${t.swiftBic}: ${payments.bank_swift_bic}`,
        bank.instructions || payments.bank_instructions,
      ].filter(Boolean).join("\n"));
    } else block(t.bankCurrencyUnavailable(order.currency, settings.business_email || settings.business_name));
  }
  if (settings.account_manager_name || settings.account_manager_email || settings.account_manager_phone) {
    heading(t.accountManager);
    block([settings.account_manager_name, settings.account_manager_email, settings.account_manager_phone].filter(Boolean).join("\n"));
  }
  ensure(135); y -= 20; rule(y, accent); y -= 18;
  columns([
    { title: settings.business_name, text: [
      settings.company_registration_number && `${t.companyNo}: ${settings.company_registration_number}`,
      settings.vat_registration_number && `${t.vatId}: ${settings.vat_registration_number}`,
      settings.tax_id && `${t.taxId}: ${settings.tax_id}`,
    ].filter(Boolean).join("\n") },
    { title: t.registeredOffice, text: settings.business_address || t.registeredAddressNotConfigured },
    { title: t.contact, text: [settings.business_email, settings.business_phone, settings.business_website].filter(Boolean).join("\n") },
  ]);
  if (settings.footer_note) block(settings.footer_note, 8, regular, muted);
  const pages = doc.getPages();
  pages.forEach((current, index) => {
    page = current;
    rule(43);
    line(invoiceNumber, left, 33, 8, regular, muted);
    const label = `${index + 1} / ${pages.length}`;
    line(label, right - regular.widthOfTextAtSize(label, 8), 33, 8, regular, muted);
  });
  doc.setTitle(`${t.invoiceWord} ${invoiceNumber}`);
  doc.setAuthor(settings.business_name);
  doc.setCreationDate(issueDate);
  return Buffer.from(await doc.save());
}
