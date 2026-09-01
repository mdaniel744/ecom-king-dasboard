-- One-time Supabase migration for the three storefront submission paths.
-- Replace both placeholders in notify_storefront_submission_webhook() before
-- running this file in the Supabase SQL Editor.
--
-- Routing contract:
--   inquiry / request-a-quote          -> public.inquiries       -> Inquiries
--   Buy Now / cart checkout            -> public.checkout_orders -> Orders
--   Buy with Protection / escrow       -> public.orders          -> Escrow Orders

alter table public.stores
  add column if not exists notify_inquiries boolean not null default true,
  add column if not exists notify_checkout_orders boolean not null default true,
  add column if not exists notify_escrow_orders boolean not null default true;

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_storefront_submission_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  submission_type text;
begin
  submission_type := case TG_TABLE_NAME
    when 'inquiries' then 'inquiry'
    when 'checkout_orders' then 'checkout_order'
    when 'orders' then 'escrow_order'
    else null
  end;

  if submission_type is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://YOUR-DASHBOARD-DOMAIN.example/api/submissions/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'REPLACE_WITH_SUBMISSION_NOTIFICATION_WEBHOOK_SECRET'
    ),
    body := jsonb_build_object('id', new.id, 'type', submission_type)
  );

  return new;
end;
$$;

-- Supersede the original inquiry-only email trigger so an inquiry produces
-- one staff notification, not two.
drop trigger if exists inquiries_notify_trigger on public.inquiries;
drop trigger if exists inquiries_submission_notify_trigger on public.inquiries;
create trigger inquiries_submission_notify_trigger
after insert on public.inquiries
for each row execute function public.notify_storefront_submission_webhook();

drop trigger if exists checkout_orders_submission_notify_trigger on public.checkout_orders;
create trigger checkout_orders_submission_notify_trigger
after insert on public.checkout_orders
for each row execute function public.notify_storefront_submission_webhook();

drop trigger if exists orders_submission_notify_trigger on public.orders;
create trigger orders_submission_notify_trigger
after insert on public.orders
for each row execute function public.notify_storefront_submission_webhook();
