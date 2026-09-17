-- Make a product's public reference/model number its automatic Google
-- Merchant MPN whenever no separate MPN has been supplied.
-- Safe to run more than once in the Supabase SQL Editor.

update public.products
set mpn = btrim(reference_number)
where nullif(btrim(reference_number), '') is not null
  and nullif(btrim(mpn), '') is null;

create or replace function public.assign_product_reference_to_mpn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(new.mpn), '') is null
     and nullif(btrim(new.reference_number), '') is not null then
    new.mpn := btrim(new.reference_number);
  elsif tg_op = 'UPDATE' then
    if new.reference_number is distinct from old.reference_number
       and nullif(btrim(old.mpn), '') = nullif(btrim(old.reference_number), '')
       and nullif(btrim(new.reference_number), '') is not null then
      -- Keep an automatically derived MPN aligned when its reference changes.
      new.mpn := btrim(new.reference_number);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists products_assign_reference_to_mpn on public.products;

create trigger products_assign_reference_to_mpn
before insert or update of reference_number, mpn on public.products
for each row
execute function public.assign_product_reference_to_mpn();

comment on function public.assign_product_reference_to_mpn() is
  'Copies a product reference number to MPN when no explicit MPN exists, so Google Merchant receives the identifier.';
