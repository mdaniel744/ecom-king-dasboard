# Order invoice PDFs

Apply `scripts/setup-invoice-documents.sql` in Supabase **before deploying**.
The migration adds a private, RLS-protected PDF archive. Browser roles have no
direct access. Server downloads authorize the current store and check both the
order and document IDs. There are no public PDF links or public storage buckets.

Both automatic checkout invoices and the order's Send/Resend action archive the
PDF before emailing it as an attachment. Each send gets a separate record; the
PDF bytes, recipient, number and issue date cannot be edited. Automatic invoices use
the saved checkout totals, tax rate, currency and language. Layout settings are read only
at generation time, so subsequent customization does not change existing PDFs.
Unicode fonts are packaged with the app. PNG/JPEG logos from the store's own
Supabase image bucket are embedded; inaccessible/other logos use text branding.

The product rows use each saved `line_subtotal` (or saved inclusive line total
minus its recorded tax for older integrations), rather than multiplying rounded
unit prices again. The summary always shows product subtotal, discounts, recorded
tax and delivery, even if the legacy `show_tax_breakdown` setting was false.
Invoices are rejected before PDF creation/email if their saved product amounts
or final totals do not balance; the system never silently changes a checkout total
or adds today's VAT to tax-inclusive checkout amounts.

## Delivery fee before sending

From Invoices, choose **Prepare invoice**, or open the order's **Customer invoice**
panel. Staff can enter a delivery fee and VAT rate for an unpaid order. The live
calculation and server use the same rule (rounded to currency minor units):

`taxable amount = net item subtotal - discount + delivery fee`

`VAT = taxable amount × VAT rate / 100`

`invoice total = taxable amount + VAT`

Only fee, rate and the expected order version come from the browser. The server
re-reads the authenticated store's order and rejects stale previews. Checkout
product prices, payment records and previously issued PDFs are never rewritten.
The new `pricing_snapshot` field records each invoice's own totals, including its
original checkout total. The invoice register displays the latest sent invoice's
amount; the order's checkout breakdown continues to show the original checkout.

Re-run the latest `scripts/setup-invoice-documents.sql` before deploying this
change. It safely adds the nullable snapshot field to existing archives without
rewriting old documents. Old documents with no snapshot keep their legacy behavior.
Failed sends retain their attempted snapshot but do not become the default for a
later resend. Paid/refunded/completed/cancelled orders cannot edit fees; resends
keep their latest sent invoice's archived amounts. Automatic sending is not delayed
by this manual editor; disable it in Invoice Settings if delivery must be entered
before the first customer invoice.

Invoice Settings clearly distinguishes its example layout from actual orders.
Its recent-order selector uses store-scoped checkout snapshots: switching market
rates cannot change an order preview's recorded currency, tax or delivery amount.

Orders show **Invoice PDFs**, with View PDF and Download controls for every
attempt. Failed sends retain their PDFs and do not overwrite earlier successful
send details. Local demo mode simulates sending without contacting SMTP.

Legacy email-only invoices have no historical PDF. The order page explains this;
resending produces a new PDF, not a reconstruction of the old email. There is no
automatic backfill that would falsely claim current branding was used earlier.

If SMTP accepts an email but the database confirmation fails, its PDF remains
`pending` (Delivery unconfirmed). Check SMTP logs before reconciling the record
as sent or failed with an admin SQL update; never blindly retry it. A unique
pending-send index prevents overlapping attempts. A separate automatic-send
index prevents duplicate webhook deliveries after a successful automatic send.
If only the order summary update fails, the sent archive remains authoritative
and webhook retries recognize it without sending another email.

PDFs are limited to 5 MB and stored as base64 in the same private database row as
their delivery state, avoiding orphaned public files. History queries select
metadata only and page through all records. Each download reads only that PDF
and returns `private, no-store` headers. Database backups therefore include the
invoice archive; normal tenant/order cascade deletion also deletes its archive.

Verification: `node --test tests/*.test.mjs`, `npm run build`.
Set `INVOICE_PDF_QA=true` when running `tests/invoice-documents.test.mjs` to
write Czech single/multipage test PDFs under ignored `tmp/pdfs/` for visual QA.
