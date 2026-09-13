-- Run before deploying the settlement UI/actions.
alter table public.orders
  add column if not exists settlement_currency text,
  add column if not exists settlement_amount numeric,
  add column if not exists settlement_exchange_rate numeric,
  add column if not exists settlement_rate_date date,
  add column if not exists settlement_rate_source text,
  add column if not exists settlement_notes text;

do $$ begin
  alter table public.orders add constraint orders_settlement_currency_format
    check (settlement_currency is null or settlement_currency ~ '^[A-Z]{3}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.orders add constraint orders_settlement_amount_nonnegative
    check (settlement_amount is null or settlement_amount >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.orders add constraint orders_settlement_rate_positive
    check (settlement_exchange_rate is null or settlement_exchange_rate > 0);
exception when duplicate_object then null; end $$;
