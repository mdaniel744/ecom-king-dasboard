-- Legacy inquiry-only setup. New installations should use
-- setup-submission-notifications.sql so all three storefront paths are covered.
-- Run this once in the Supabase SQL Editor to wire up
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
    url := 'https://YOUR-DASHBOARD-DOMAIN.example/api/inquiries/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'REPLACE_WITH_INQUIRY_WEBHOOK_SECRET'
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
