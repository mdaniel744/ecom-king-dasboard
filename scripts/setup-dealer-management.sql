-- One-time Supabase migration for dealer listing ownership and profile metrics.
-- Run this in the Supabase SQL Editor before enabling dealer listing creation.

alter table public.products
  add column if not exists dealer_user_id text;

comment on column public.products.dealer_user_id is
  'Clerk user id of the dealer who owns this marketplace listing; null means store-owned.';

create index if not exists products_store_dealer_created_idx
  on public.products (store_id, dealer_user_id, created_at desc)
  where dealer_user_id is not null;

create index if not exists products_store_dealer_status_idx
  on public.products (store_id, dealer_user_id, status)
  where dealer_user_id is not null;

create index if not exists orders_store_dealer_status_idx
  on public.orders (store_id, dealer_user_id, escrow_status)
  where dealer_user_id is not null;

create index if not exists dealer_applications_store_status_created_idx
  on public.dealer_applications (store_id, status, created_at desc);
