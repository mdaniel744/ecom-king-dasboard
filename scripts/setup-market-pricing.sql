-- Per-market display currencies for automatic product price conversion.
-- Safe to run more than once in the Supabase SQL Editor.

alter table public.stores
  add column if not exists market_currencies jsonb not null default '{}'::jsonb;

alter table public.stores
  add column if not exists locale_markets jsonb not null default '{}'::jsonb;

comment on column public.stores.market_currencies is
  'ISO 4217 display currency keyed by delivery market country code. Product prices are converted from their stored currency before market VAT is applied.';

comment on column public.stores.locale_markets is
  'Delivery market keyed by storefront locale. Used to resolve language switcher changes to the correct market currency and VAT.';
