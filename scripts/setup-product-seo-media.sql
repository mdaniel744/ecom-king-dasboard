-- One-time setup: run this in the Supabase SQL Editor before saving the new
-- product SEO and image metadata fields against a live database.

alter table public.products
  add column if not exists meta_title text,
  add column if not exists meta_description text,
  add column if not exists image_titles text[] not null default '{}',
  add column if not exists image_descriptions text[] not null default '{}';

comment on column public.products.meta_title is
  'Product-specific HTML meta title used by storefront product pages.';

comment on column public.products.meta_description is
  'Product-specific HTML meta description used by storefront product pages.';

comment on column public.products.image_titles is
  'Image titles aligned by array position with products.images.';

comment on column public.products.image_descriptions is
  'Image descriptions aligned by array position with products.images.';
