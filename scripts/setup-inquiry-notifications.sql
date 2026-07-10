-- One-time setup: run this once in the Supabase SQL Editor to wire up
-- automatic inquiry notification emails. After this, every new row inserted
-- into `inquiries` (by any storefront, for any store) triggers a call to
-- /api/inquiries/notify, which emails that store's own notification_email
-- (set per-store in Settings) if one is configured.

alter table public.stores
  add column if not exists notification_email text;

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_inquiry_webhook()
returns trigger
language plpgsql
as $$
begin
  perform net.http_post(
    url := 'https://mycontainergmbh.com/api/inquiries/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'a6a9640461b3f450246d3340a1f7c0e6470538d3676c589c44fdab6716979dc3'
    ),
    body := jsonb_build_object('id', NEW.id)
  );
  return NEW;
end;
$$;

drop trigger if exists inquiries_notify_trigger on public.inquiries;

create trigger inquiries_notify_trigger
after insert on public.inquiries
for each row
execute function public.notify_inquiry_webhook();
