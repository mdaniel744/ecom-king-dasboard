-- Shared tenant media bucket used by dashboard image uploads, including
-- invoice logos and product media. Safe to run more than once.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'store-images',
  'store-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Uploads are made only by the server-side service-role client after the
-- current dashboard user's store has been resolved. Public-read is required
-- because logos and product images are embedded in storefronts and invoices.
