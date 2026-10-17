-- Run once in Supabase SQL Editor before deploying invoice PDF support.
-- PDFs contain personal/bank information. No public bucket or browser access.
begin;
create unique index if not exists checkout_orders_id_store_key on public.checkout_orders (id, store_id);
create table if not exists public.checkout_invoice_documents (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null,
  invoice_number text not null,
  file_name text not null,
  -- Base64 keeps file bytes and delivery state in one transactional private row.
  -- List queries explicitly omit this column; no public Storage URL is generated.
  pdf_base64 text not null check (length(pdf_base64) between 1 and 6990508),
  recipient_email text not null,
  locale text not null,
  send_status text not null default 'pending' check (send_status in ('pending', 'sent', 'failed')),
  automatic boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (order_id, store_id) references public.checkout_orders(id, store_id) on delete cascade,
  check ((send_status = 'sent') = (sent_at is not null))
);
create index if not exists checkout_invoice_documents_order_idx
  on public.checkout_invoice_documents (store_id, order_id, created_at desc);
-- Prevent concurrent clicks/webhook deliveries from emailing duplicate copies.
create unique index if not exists checkout_invoice_documents_pending_key
  on public.checkout_invoice_documents (order_id) where send_status = 'pending';
-- Retried/concurrent webhook events must not send again after a successful send.
create unique index if not exists checkout_invoice_documents_automatic_key
  on public.checkout_invoice_documents (order_id) where automatic = true and send_status <> 'failed';
alter table public.checkout_invoice_documents enable row level security;
revoke all on public.checkout_invoice_documents from public, anon, authenticated;
grant select, insert, update on public.checkout_invoice_documents to service_role;

create or replace function public.protect_invoice_document_snapshot()
returns trigger language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - 'send_status' - 'sent_at') is distinct from
     (to_jsonb(old) - 'send_status' - 'sent_at') then
    raise exception 'Archived invoice content is immutable';
  end if;
  if old.send_status <> 'pending' and new is distinct from old then
    raise exception 'Final invoice delivery records are immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_invoice_document_snapshot on public.checkout_invoice_documents;
create trigger protect_invoice_document_snapshot before update on public.checkout_invoice_documents
  for each row execute function public.protect_invoice_document_snapshot();
commit;

-- Older email-only invoices cannot be recreated exactly. No automatic backfill.
-- A pending record means SMTP may have accepted the email but confirmation failed.
-- Review SMTP logs before reconciling it with a service-role/admin SQL update:
--   send_status='sent', sent_at=<actual send time>, OR send_status='failed'.
-- Never automatically expire/retry a pending send: that could email a duplicate.
