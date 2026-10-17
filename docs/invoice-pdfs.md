# Order invoice PDFs

Apply `scripts/setup-invoice-documents.sql` in Supabase **before deploying**.
The migration adds a private, RLS-protected PDF archive. Browser roles have no
direct access. Server downloads authorize the current store and check both the
order and document IDs. There are no public PDF links or public storage buckets.

Both automatic checkout invoices and the order's Send/Resend action archive the
PDF before emailing it as an attachment. Each send gets a separate record; the
PDF bytes, recipient, number and issue date cannot be edited. PDFs use the saved
checkout totals, tax rate, currency and language. Layout settings are read only
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
