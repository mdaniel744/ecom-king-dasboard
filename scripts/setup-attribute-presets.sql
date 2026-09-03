-- Run once in the Supabase SQL editor.
-- Attribute presets are private, reusable product-upload helpers for each store.

create table if not exists public.attribute_presets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attribute_presets_attributes_object
    check (jsonb_typeof(attributes) = 'object')
);

create unique index if not exists attribute_presets_store_name_unique
  on public.attribute_presets (store_id, lower(name));

create index if not exists attribute_presets_store_id_idx
  on public.attribute_presets (store_id);

alter table public.attribute_presets enable row level security;

create or replace function public.set_attribute_presets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists attribute_presets_set_updated_at on public.attribute_presets;
create trigger attribute_presets_set_updated_at
before update on public.attribute_presets
for each row execute function public.set_attribute_presets_updated_at();
