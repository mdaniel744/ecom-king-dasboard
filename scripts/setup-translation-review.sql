-- Run before deploying code that reads/writes translations.needs_review.
-- Existing translations remain valid and are not marked retroactively.
alter table public.translations
  add column if not exists needs_review boolean not null default false;

create index if not exists translations_human_review_idx
  on public.translations (store_id, entity_type, entity_id, locale)
  where translator = 'human' and needs_review = true;
