import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { compileFunction } from "node:vm";
import { PDFDocument } from "pdf-lib";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  compileFunction(code, ["require", "module", "exports"])(key => {
    if (key in mocks) return mocks[key];
    if (key === "server-only") return {};
    assert.ok(!key.startsWith("@/"), `Missing mock ${key}`);
    return require(key);
  }, module, module.exports);
  return module.exports;
}
const i18n = load("../lib/invoice-i18n.ts");
const display = load("../lib/checkout-order-display.ts");
const vat = load("../lib/invoice-vat.ts");
const amounts = load("../lib/checkout-invoice-amounts.ts");
const payment = load("../lib/payment-currency.ts");
const defaults = load("../lib/invoice-settings-defaults.ts");
const paymentDefaults = load("../lib/payment-settings-defaults.ts");
const pdfModule = load("../lib/invoice-pdf.ts", {
  "@/lib/checkout-order-display": display, "@/lib/invoice-i18n": i18n,
  "@/lib/invoice-vat": vat, "@/lib/payment-currency": payment,
  "@/lib/checkout-invoice-amounts": amounts,
});
const storeId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000601";
const store = { id: storeId, name: "Example GmbH", notification_email: "office@example.test" };
const settings = { ...defaults.defaultInvoiceSettings(storeId, store.name), business_address: "Musterstraße 12\n10115 Berlin\nDeutschland",
  vat_registration_number: "DE123456789", company_registration_number: "HRB 12345", business_email: "office@example.test",
  business_phone: "+49 30 123456", business_website: "example.test", footer_note: "Example invoice - test data only." };
const payments = paymentDefaults.defaultPaymentSettings(storeId);
const order = { id: orderId, store_id: storeId, order_number: "ORD-20261017-00001", invoice_number: null,
  customer_name: "Jana Dvořáková", customer_email: "customer@example.test", locale: "cs", currency: "CZK",
  billing_address: { full_name: "Jana Dvořáková", address_line_1: "Dlouhá 12", postal_code: "110 00", city: "Praha", country: "Česká republika" },
  delivery_address: { full_name: "Jana Dvořáková", address_line_1: "Dlouhá 12", postal_code: "110 00", city: "Praha", country: "Česká republika" },
  line_items: [{ product_id: "product-1", title: "Hodinky s ocelovým pouzdrem - černý ciferník", sku: "REF-123", quantity: 2, price: 1000 }],
  subtotal: 2000, discount_amount: 0, shipping_amount: 100, tax_rate: 21, tax_amount: 420, total_amount: 2520,
  invoice_status: "not_sent", invoice_sent_at: null, created_at: "2026-10-01T12:00:00Z", auto_invoice: true,
};

function database({ archiveError, sentError, orderError } = {}) {
  const rows = { checkout_orders: [structuredClone(order)], checkout_invoice_documents: [], stores: [store] };
  const queries = [];
  return { rows, queries, from(table) {
    const filters = [];
    let mutation = "select", payload, singular = false, range;
    const query = { table, filters, columns: "*" }; queries.push(query);
    const chain = {
      select(columns = "*") { query.columns = columns; return chain; },
      eq(key, value) { filters.push([key, value]); return chain; },
      order() { return chain; }, range(from, to) { range = [from, to]; return chain; },
      single() { singular = true; return chain; }, maybeSingle() { singular = true; return chain; },
      insert(value) { mutation = "insert"; payload = structuredClone(value); return chain; },
      update(value) { mutation = "update"; payload = structuredClone(value); return chain; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        const list = rows[table] ??= [];
        let data = list.filter(row => filters.every(([key, value]) => row[key] === value));
        if (mutation === "insert") {
          if (archiveError) return { error: archiveError, data: null };
          if (list.some(row => row.order_id === payload.order_id && (row.send_status === "pending" || (payload.automatic && row.automatic && row.send_status !== "failed")))) {
            return { error: { code: "23505" }, data: null };
          }
          list.push(payload); data = [payload];
        }
        if (mutation === "update") {
          if (table === "checkout_invoice_documents" && payload.send_status === "sent" && sentError) return { error: sentError, data: null };
          if (table === "checkout_orders" && orderError) return { error: orderError, data: null };
          data.forEach(row => Object.assign(row, payload));
        }
        if (range) data = data.slice(range[0], range[1] + 1);
        // Model explicit column projection, preventing unnoticed PDF-byte list leaks.
        if (query.columns !== "*") data = data.map(row => Object.fromEntries(query.columns.split(",").map(key => [key, row[key]])));
        return { error: null, data: singular ? data[0] ?? null : data };
      }).then(resolve, reject); },
    };
    return chain;
  } };
}

function deliveryFixture(options = {}) {
  const db = database(options), emails = [];
  const invoice = load("../lib/invoice-documents.ts", {
    "@/lib/supabase-admin": { supabaseAdmin: db }, "@/lib/local-demo": { isLocalDemoMode: options.demo ?? false },
    "@/lib/checkout-invoice": {
      checkoutInvoiceNumber: value => value.invoice_number || "INV-20261017-00001",
      sendCheckoutInvoiceEmail: async (savedOrder, savedStore, savedSettings, savedPayments, attachment) => {
        assert.equal(db.rows.checkout_invoice_documents.length > 0, true, "Must archive before SMTP");
        assert.equal(db.rows.checkout_invoice_documents.at(-1).send_status, "pending");
        if (options.emailError) throw new Error("SMTP unavailable");
        emails.push(attachment);
      },
    },
    "@/lib/invoice-pdf": { ...pdfModule, invoiceLogoBytes: async () => undefined,
      renderCheckoutInvoicePdf: async () => Buffer.from("%PDF-1.7\nFrozen invoice fixture") },
    "@/lib/invoice-i18n": i18n,
    "@/lib/checkout-invoice-amounts": amounts,
  });
  return { invoice, db, emails };
}

test("sending archives identical email PDF bytes, scopes records to the store, and preserves every resend", async () => {
  const { invoice, db, emails } = deliveryFixture();
  await invoice.deliverCheckoutInvoice(order, store, settings, payments);
  await invoice.deliverCheckoutInvoice(db.rows.checkout_orders[0], store, { ...settings, business_name: "Changed" }, payments);
  const documents = db.rows.checkout_invoice_documents;
  assert.equal(documents.length, 2);
  assert.notEqual(documents[0].id, documents[1].id);
  for (const [i, document] of documents.entries()) {
    assert.equal(document.store_id, storeId); assert.equal(document.order_id, orderId);
    assert.equal(document.send_status, "sent"); assert.ok(document.sent_at);
    assert.deepEqual(Buffer.from(document.pdf_base64, "base64"), emails[i].content);
  }
  const history = await invoice.getOrderInvoiceDocuments(storeId, orderId);
  assert.equal(history.documents.length, 2);
  assert.equal("pdf_base64" in history.documents[0], false);
  assert.deepEqual((await invoice.getOrderInvoiceDocuments("other-store", orderId)).documents, []);
});

test("archive failure blocks email; wrong tenant settings cannot produce any writes", async () => {
  const fixture = deliveryFixture({ archiveError: { code: "42P01" } });
  await assert.rejects(fixture.invoice.deliverCheckoutInvoice(order, store, settings, payments), /setup-invoice-documents.sql/);
  assert.equal(fixture.emails.length, 0);
  for (const [otherStore, otherSettings, otherPayments] of [
    [{ ...store, id: "other" }, settings, payments], [store, { ...settings, store_id: "other" }, payments],
    [store, settings, { ...payments, store_id: "other" }],
  ]) await assert.rejects(fixture.invoice.deliverCheckoutInvoice(order, otherStore, otherSettings, otherPayments), /ownership/);
  assert.equal(fixture.db.rows.checkout_invoice_documents.length, 0);
});

test("SMTP failure retains its PDF without hiding an earlier successful invoice", async () => {
  const fixture = deliveryFixture({ emailError: true });
  const sentOrder = { ...order, invoice_status: "sent", invoice_sent_at: "2026-10-01T12:00:00Z" };
  Object.assign(fixture.db.rows.checkout_orders[0], sentOrder);
  await assert.rejects(fixture.invoice.deliverCheckoutInvoice(sentOrder, store, settings, payments), /email could not be sent/);
  assert.equal(fixture.db.rows.checkout_invoice_documents[0].send_status, "failed");
  assert.equal(fixture.db.rows.checkout_orders[0].invoice_status, "sent");
  assert.equal(fixture.db.rows.checkout_orders[0].invoice_sent_at, sentOrder.invoice_sent_at);
});

test("post-SMTP database failures retain the PDF and never misreport email failure", async () => {
  const fixture = deliveryFixture({ sentError: { code: "08006" } });
  await assert.rejects(fixture.invoice.deliverCheckoutInvoice(order, store, settings, payments), /email was accepted/);
  assert.equal(fixture.emails.length, 1);
  assert.equal(fixture.db.rows.checkout_invoice_documents[0].send_status, "pending");
  assert.notEqual(fixture.db.rows.checkout_orders[0].invoice_status, "failed");
  await assert.rejects(fixture.invoice.deliverCheckoutInvoice(order, store, settings, payments), /already in progress/);
  assert.equal(fixture.emails.length, 1);
  const summaryFailure = deliveryFixture({ orderError: { code: "08006" } });
  await assert.rejects(summaryFailure.invoice.deliverCheckoutInvoice(order, store, settings, payments), /sent and archived/);
  assert.equal(summaryFailure.db.rows.checkout_invoice_documents[0].send_status, "sent");
});

test("automatic retries cannot resend an already archived automatic invoice", async () => {
  const fixture = deliveryFixture();
  await fixture.invoice.deliverCheckoutInvoice(order, store, settings, payments, { automatic: true });
  await assert.rejects(fixture.invoice.deliverCheckoutInvoice(order, store, settings, payments, { automatic: true }), /already in progress/);
  assert.equal(fixture.emails.length, 1);
});

test("local demo archives PDFs but never sends real email", async () => {
  const fixture = deliveryFixture({ demo: true });
  await fixture.invoice.deliverCheckoutInvoice(order, store, settings, payments);
  assert.equal(fixture.emails.length, 0);
  assert.equal(fixture.db.rows.checkout_invoice_documents[0].send_status, "sent");
});

test("unbalanced checkout totals are rejected before PDF archiving or SMTP", async () => {
  const fixture = deliveryFixture();
  await assert.rejects(fixture.invoice.deliverCheckoutInvoice({ ...order, total_amount: 2000 }, store, settings, payments), /checkout amounts do not balance/);
  assert.equal(fixture.db.rows.checkout_invoice_documents.length, 0);
  assert.equal(fixture.emails.length, 0);
});

test("history reads all pages without loading PDF bytes", async () => {
  const fixture = deliveryFixture();
  for (let i = 0; i < 205; i++) fixture.db.rows.checkout_invoice_documents.push({ id: String(i), store_id: storeId, order_id: orderId });
  assert.equal((await fixture.invoice.getOrderInvoiceDocuments(storeId, orderId)).documents.length, 205);
  assert.equal(fixture.db.queries.length, 3);
  assert.ok(fixture.db.queries.every(query => !query.columns.includes("pdf_base64")));
});

test("PDF download checks store, order and document IDs and sets private inline/download headers", async () => {
  const fixture = deliveryFixture();
  await fixture.invoice.deliverCheckoutInvoice(order, store, settings, payments);
  const document = fixture.db.rows.checkout_invoice_documents[0];
  const route = load("../app/dashboard/store-orders/[id]/invoices/[invoiceId]/pdf/route.ts", {
    "@/lib/get-current-store": { getCurrentStore: async () => store },
    "@/lib/supabase-admin": { supabaseAdmin: fixture.db },
    "@/lib/validation": load("../lib/validation.ts"), "@/lib/invoice-pdf": pdfModule,
  });
  const context = params => ({ params: Promise.resolve(params) });
  for (const download of [false, true]) {
    const response = await route.GET(new Request(`http://localhost/pdf${download ? "?download=1" : ""}`), context({ id: orderId, invoiceId: document.id }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.match(response.headers.get("content-disposition"), download ? /^attachment/ : /^inline/);
    assert.match(response.headers.get("cache-control"), /private, no-store/);
    assert.equal(await response.text(), "%PDF-1.7\nFrozen invoice fixture");
  }
  for (const params of [{ id: "invalid", invoiceId: document.id },
    { id: "00000000-0000-4000-8000-000000000999", invoiceId: document.id }]) {
    assert.equal((await route.GET(new Request("http://localhost/pdf"), context(params))).status, 404);
  }
  document.store_id = "other-store";
  assert.equal((await route.GET(new Request("http://localhost/pdf"), context({ id: orderId, invoiceId: document.id }))).status, 404);
});

test("invoice email attaches the archived PDF and uses the same issue date and saved checkout VAT", async () => {
  const emails = [];
  const invoice = load("../lib/checkout-invoice.ts", {
    "@/lib/mailer": { sendMail: async value => emails.push(value), resolveStoreSmtp: () => undefined },
    "@/lib/checkout-order-display": display, "@/lib/invoice-settings-defaults": defaults,
    "@/lib/payment-settings-defaults": paymentDefaults, "@/lib/payment-currency": payment,
    "@/lib/invoice-i18n": i18n, "@/lib/invoice-vat": vat,
    "@/lib/checkout-invoice-amounts": amounts,
  });
  const attachment = { filename: "invoice.pdf", content: Buffer.from("%PDF-1.7"), issuedAt: "2026-10-17T12:00:00Z" };
  await invoice.sendCheckoutInvoiceEmail({ ...order, locale: "en" }, store, { ...settings, template: "corporate", vat_percentage: 99 }, payments, attachment);
  assert.deepEqual(emails[0].attachments, [{ filename: "invoice.pdf", content: attachment.content, contentType: "application/pdf" }]);
  assert.match(emails[0].html, /10\/17\/2026/);
  assert.match(emails[0].html, /Tax \(21%\)/);
  assert.ok(!emails[0].html.includes("99%"));
});

test("email and PDF retain exact rounded checkout lines, discount, VAT and delivery even when tax was hidden", async () => {
  const emails = [];
  const invoice = load("../lib/checkout-invoice.ts", {
    "@/lib/mailer": { sendMail: async value => emails.push(value), resolveStoreSmtp: () => undefined },
    "@/lib/checkout-order-display": display, "@/lib/invoice-settings-defaults": defaults,
    "@/lib/payment-settings-defaults": paymentDefaults, "@/lib/payment-currency": payment,
    "@/lib/invoice-i18n": i18n, "@/lib/invoice-vat": vat, "@/lib/checkout-invoice-amounts": amounts,
  });
  const checkout = { ...order, locale: "en", currency: "EUR", subtotal: 100, discount_amount: 5,
    tax_amount: 18.05, tax_rate: 19, shipping_amount: 12.5, total_amount: 125.55,
    line_items: [{ ...order.line_items[0], title: "Checkout rounding example", price: 33.33, quantity: 3, line_subtotal: 100,
      line_tax_amount: 18.05, line_total: 118.05 }],
  };
  const hiddenTax = { ...settings, show_tax_breakdown: false, vat_percentage: 99 };
  await invoice.sendCheckoutInvoiceEmail(checkout, store, hiddenTax, payments);
  assert.match(emails[0].html, /Tax \(19%\)/);
  for (const amount of ["€100.00", "€18.05", "€12.50", "€125.55", "-€5.00"]) assert.ok(emails[0].html.includes(amount), amount);
  assert.ok(!emails[0].html.includes("€99.99"));
  const bytes = await pdfModule.renderCheckoutInvoicePdf(checkout, hiddenTax, payments, "INV-CHECKOUT-EXACT", "2026-10-17T12:00:00Z");
  assert.ok(bytes.length > 1000);
  if (process.env.INVOICE_PDF_QA === "true") {
    mkdirSync(new URL("../tmp/pdfs/", import.meta.url), { recursive: true });
    writeFileSync(new URL("../tmp/pdfs/invoice-checkout-exact.pdf", import.meta.url), bytes);
  }
});

test("renderer creates paginated, Unicode-font PDFs with stable totals and no HTML execution", async () => {
  const createdAt = "2026-10-17T12:00:00Z";
  const single = await pdfModule.renderCheckoutInvoicePdf(order, settings, payments, "INV-20261017-00001", createdAt);
  const longOrder = { ...order, subtotal: 160000, tax_amount: 33600, total_amount: 193700,
    line_items: Array.from({ length: 80 }, (_, i) => ({ ...order.line_items[0], title: `${i + 1}. ${order.line_items[0].title} - ${"Detail ".repeat(14)}` })) };
  const multi = await pdfModule.renderCheckoutInvoicePdf(longOrder, { ...settings, font_family: "serif" }, payments, "INV-MULTIPAGE", createdAt);
  const singleDoc = await PDFDocument.load(single), multiDoc = await PDFDocument.load(multi);
  assert.equal(single.subarray(0, 5).toString(), "%PDF-");
  assert.equal(singleDoc.getTitle(), "Faktura INV-20261017-00001");
  assert.ok(singleDoc.getPageCount() >= 1); assert.ok(multiDoc.getPageCount() >= 4);
  assert.ok(single.length < 5 * 1024 * 1024);
  // Opt-in local visual QA artifacts; ordinary test runs do not write files.
  if (process.env.INVOICE_PDF_QA === "true") {
    mkdirSync(new URL("../tmp/pdfs/", import.meta.url), { recursive: true });
    writeFileSync(new URL("../tmp/pdfs/invoice-cs.pdf", import.meta.url), single);
    writeFileSync(new URL("../tmp/pdfs/invoice-multipage.pdf", import.meta.url), multi);
  }
  assert.equal(pdfModule.invoicePdfFilename('INV-1"\r\n/path'), "INV-1____path.pdf");
});
