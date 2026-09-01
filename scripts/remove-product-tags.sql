-- Removes the retired Product Tags feature if its earlier setup scripts were
-- already applied to Supabase. Product rows themselves are never deleted.

begin;

drop view if exists public.product_tagged_products;
drop table if exists public.product_tag_assignments;
drop table if exists public.product_tags;
drop function if exists public.enforce_product_tag_same_store();
drop function if exists public.set_product_tags_updated_at();

alter table public.products
  drop column if exists search_tags;

commit;
