-- One-time Supabase migration for Bureau management.
-- Run in the Supabase SQL Editor after reviewing the webhook URL and secret.

create extension if not exists pg_net with schema extensions;

create sequence if not exists public.inquiry_number_seq;
create sequence if not exists public.checkout_order_number_seq;

alter table public.inquiries
  add column if not exists inquiry_number text,
  add column if not exists customer_company text,
  add column if not exists customer_address jsonb,
  add column if not exists product_url text,
  add column if not exists requested_quantity integer,
  add column if not exists admin_notes text,
  add column if not exists updated_at timestamptz not null default now();

update public.inquiries
set inquiry_number = 'ENQ-' || to_char(created_at, 'YYYYMMDD') || '-' ||
  lpad(nextval('public.inquiry_number_seq')::text, 5, '0')
where inquiry_number is null;

create unique index if not exists inquiries_store_number_key
  on public.inquiries (store_id, inquiry_number)
  where inquiry_number is not null;

alter table public.inquiries
  alter column inquiry_number set default (
    'ENQ-' || to_char(now(), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.inquiry_number_seq')::text, 5, '0')
  );

create table if not exists public.checkout_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_number text not null default (
    'ORD-' || to_char(now(), 'YYYYMMDD') || '-' ||
    lpad(nextval('public.checkout_order_number_seq')::text, 5, '0')
  ),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  line_items jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array'),
  billing_address jsonb,
  delivery_address jsonb,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  shipping_amount numeric(12,2) not null default 0 check (shipping_amount >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  currency text not null default 'USD',
  payment_method text not null default 'bank_transfer' check (payment_method = 'bank_transfer'),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  payment_reference text,
  order_status text not null default 'pending_payment'
    check (order_status in ('pending_payment', 'paid', 'processing', 'ready_to_ship', 'shipped', 'completed', 'cancelled')),
  customer_note text,
  admin_notes text,
  tracking_number text,
  auto_invoice boolean not null default true,
  invoice_number text,
  invoice_status text not null default 'not_sent'
    check (invoice_status in ('not_sent', 'sent', 'failed')),
  invoice_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, order_number)
);

create index if not exists checkout_orders_store_created_idx
  on public.checkout_orders (store_id, created_at desc);

create index if not exists checkout_orders_store_status_idx
  on public.checkout_orders (store_id, order_status);

alter table public.checkout_orders enable row level security;

-- Dashboard access uses the server-only service-role client. Create a narrow
-- storefront INSERT policy separately only if checkout writes directly from
-- the browser; a server checkout endpoint is preferred.

create or replace function public.set_bureau_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inquiries_set_updated_at on public.inquiries;
create trigger inquiries_set_updated_at
before update on public.inquiries
for each row execute function public.set_bureau_updated_at();

drop trigger if exists checkout_orders_set_updated_at on public.checkout_orders;
create trigger checkout_orders_set_updated_at
before update on public.checkout_orders
for each row execute function public.set_bureau_updated_at();

-- Replace both placeholder values before running this section in production.
-- ORDER_INVOICE_WEBHOOK_SECRET in the app environment must match the header.
create or replace function public.notify_checkout_invoice_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://YOUR-DASHBOARD-DOMAIN.example/api/orders/invoice',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'REPLACE_WITH_ORDER_INVOICE_WEBHOOK_SECRET'
    ),
    body := jsonb_build_object('id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists checkout_orders_invoice_trigger on public.checkout_orders;
create trigger checkout_orders_invoice_trigger
after insert on public.checkout_orders
for each row
when (new.auto_invoice = true)
execute function public.notify_checkout_invoice_webhook();
