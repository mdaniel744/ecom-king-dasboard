-- Tenant-scoped invoice design and delivery settings.
-- Safe to run more than once in the Supabase SQL Editor.
-- Run setup-store-images.sql once to enable uploaded invoice logos.

create table if not exists public.invoice_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  template text not null default 'modern'
    check (template in ('classic', 'modern', 'minimal', 'corporate')),
  accent_color text not null default '#111827'
    check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  font_family text not null default 'sans'
    check (font_family in ('sans', 'serif')),
  logo_url text,
  business_name text not null,
  business_address text,
  business_email text,
  business_phone text,
  business_website text,
  company_registration_number text,
  vat_registration_number text,
  tax_id text,
  account_manager_name text,
  account_manager_email text,
  account_manager_phone text,
  invoice_prefix text not null default 'INV',
  due_days integer not null default 7 check (due_days between 0 and 365),
  payment_terms text,
  delivery_terms text,
  deposit_percentage integer not null default 0
    check (deposit_percentage between 0 and 100),
  commercial_terms text,
  auto_send boolean not null default true,
  footer_note text,
  show_logo boolean not null default true,
  show_billing_address boolean not null default true,
  show_shipping_address boolean not null default true,
  show_tax_breakdown boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoice_settings
  add column if not exists business_website text,
  add column if not exists company_registration_number text,
  add column if not exists vat_registration_number text,
  add column if not exists account_manager_name text,
  add column if not exists account_manager_email text,
  add column if not exists account_manager_phone text,
  add column if not exists payment_terms text,
  add column if not exists delivery_terms text,
  add column if not exists deposit_percentage integer not null default 0,
  add column if not exists commercial_terms text;

alter table public.invoice_settings
  drop constraint if exists invoice_settings_template_check;
alter table public.invoice_settings
  add constraint invoice_settings_template_check
  check (template in ('classic', 'modern', 'minimal', 'corporate'));

alter table public.invoice_settings
  drop constraint if exists invoice_settings_deposit_percentage_check;
alter table public.invoice_settings
  add constraint invoice_settings_deposit_percentage_check
  check (deposit_percentage between 0 and 100);

create index if not exists invoice_settings_store_idx
  on public.invoice_settings (store_id);

alter table public.invoice_settings enable row level security;

create or replace function public.set_invoice_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists invoice_settings_set_updated_at on public.invoice_settings;
create trigger invoice_settings_set_updated_at
before update on public.invoice_settings
for each row execute function public.set_invoice_settings_updated_at();

-- The dashboard reads and writes through the server-only service-role client.
-- Storefront access should go through a narrow server endpoint rather than a
-- public browser policy so one tenant can never read another tenant's layout.
