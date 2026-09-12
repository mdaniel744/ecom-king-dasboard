-- Run once in the Supabase SQL editor after setup-bureau-management.sql.
-- Keeps complete storefront checkout and request-a-quote submissions while
-- preserving the existing columns and payloads used by older storefronts.

alter table public.checkout_orders
  add column if not exists customer_details jsonb not null default '{}'::jsonb,
  add column if not exists form_data jsonb not null default '{}'::jsonb,
  add column if not exists market text,
  add column if not exists locale text,
  add column if not exists tax_rate numeric(7,4) not null default 0,
  add column if not exists delivery_method text;

alter table public.inquiries
  add column if not exists customer_details jsonb not null default '{}'::jsonb,
  add column if not exists billing_address jsonb,
  add column if not exists delivery_address jsonb,
  add column if not exists product_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists form_data jsonb not null default '{}'::jsonb;

comment on column public.checkout_orders.customer_details is
  'Additional customer fields captured by the storefront checkout form.';
comment on column public.checkout_orders.form_data is
  'Additional checkout form responses not represented by dedicated columns.';
comment on column public.checkout_orders.tax_rate is
  'VAT percentage used when the checkout total was calculated.';
comment on column public.inquiries.product_snapshot is
  'Product name, URL, image, price, type, SKU and selected configuration at submission time.';
comment on column public.inquiries.form_data is
  'Additional request-a-quote form responses not represented by dedicated columns.';
