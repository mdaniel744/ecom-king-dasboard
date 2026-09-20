-- Optional deployment wiring for dealer listings written directly to
-- Supabase rather than through the dashboard/import routes.
--
-- Prerequisites (do not insert real values into source control):
--   1. Enable pg_net in the Supabase project.
--   2. Put the deployed dashboard URL and PRODUCT_TRANSLATION_WEBHOOK_SECRET
--      into Supabase Vault as dashboard_url and product_translation_webhook_secret.
--
-- The exact tenant predicate prevents this rollout changing other stores.
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_kariv_product_translation()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  dashboard_url text;
  webhook_secret text;
  changed_fields jsonb := '[]'::jsonb;
begin
  if new.store_id <> '7efd71bc-0287-4f40-8a2f-1de330c49522'::uuid
     or coalesce(to_jsonb(new)->>'dealer_user_id', to_jsonb(new)->>'dealer_id') is null then
    return new;
  end if;

  select decrypted_secret into dashboard_url
  from vault.decrypted_secrets where name = 'dashboard_url' limit 1;
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets where name = 'product_translation_webhook_secret' limit 1;
  if dashboard_url is null or webhook_secret is null then
    raise warning 'Kariv product translation webhook is not configured in Vault';
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.name is distinct from old.name then changed_fields := changed_fields || jsonb_build_array('name'); end if;
    if new.short_description is distinct from old.short_description then changed_fields := changed_fields || jsonb_build_array('short_description'); end if;
    if new.description is distinct from old.description then changed_fields := changed_fields || jsonb_build_array('description'); end if;
    if new.meta_title is distinct from old.meta_title then changed_fields := changed_fields || jsonb_build_array('meta_title'); end if;
    if new.meta_description is distinct from old.meta_description then changed_fields := changed_fields || jsonb_build_array('meta_description'); end if;
    if new.badge is distinct from old.badge then changed_fields := changed_fields || jsonb_build_array('badge'); end if;
    if new.google_title is distinct from old.google_title then changed_fields := changed_fields || jsonb_build_array('google_title'); end if;
    if new.google_description is distinct from old.google_description then changed_fields := changed_fields || jsonb_build_array('google_description'); end if;
    if jsonb_array_length(changed_fields) = 0 then return new; end if;
  end if;

  perform net.http_post(
    url := rtrim(dashboard_url, '/') || '/api/products/translate',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-product-translation-secret', webhook_secret),
    body := jsonb_build_object(
      'storeId', new.store_id,
      'productId', new.id,
      'operation', case when tg_op = 'INSERT' then 'create' else 'update' end,
      'changedFields', changed_fields
    )
  );
  return new;
end;
$$;

drop trigger if exists kariv_dealer_product_translation on public.products;
create trigger kariv_dealer_product_translation
after insert or update of name, short_description, description, meta_title, meta_description, badge, google_title, google_description on public.products
for each row execute function public.notify_kariv_product_translation();
