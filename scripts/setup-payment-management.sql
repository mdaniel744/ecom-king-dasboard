-- Tenant-scoped storefront payment method settings.
-- Safe to run more than once in the Supabase SQL Editor.

create table if not exists public.payment_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  bank_transfer_enabled boolean not null default true,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_country text,
  bank_currency text not null default 'USD'
    check (bank_currency ~ '^[A-Z]{3}$'),
  bank_iban text,
  bank_swift_bic text,
  bank_instructions text,
  card_enabled boolean not null default false,
  card_provider text
    check (card_provider is null or card_provider in ('stripe', 'paystack', 'flutterwave', 'other')),
  card_checkout_label text,
  crypto_enabled boolean not null default false,
  crypto_assets text[] not null default '{}',
  crypto_wallet_details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_settings enable row level security;

create or replace function public.set_payment_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payment_settings_set_updated_at on public.payment_settings;
create trigger payment_settings_set_updated_at
before update on public.payment_settings
for each row execute function public.set_payment_settings_updated_at();

-- Payment gateway secret keys must remain in environment variables or a
-- secure secret vault. Never store Stripe, Paystack, Flutterwave, or wallet
-- private keys in this table.
