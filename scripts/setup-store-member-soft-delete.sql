-- Already applied directly to production. Kept here as a record, matching
-- this repo's convention of a script file per schema change.
--
-- Soft-delete for store_members: getCurrentStore() (lib/get-current-store.ts)
-- auto-provisions a brand-new store, with the signed-in user as its owner,
-- whenever it finds no active membership row for them. That's correct for a
-- genuinely new signup, but a hard DELETE on removal made a removed
-- teammate look identical to a brand-new user on their next sign-in -- they
-- got handed a fresh store as its owner instead of being blocked. Now
-- removeTeammate sets removed_at instead of deleting, and getCurrentStore()
-- redirects anyone whose only row(s) are removed to /access-revoked rather
-- than falling through to auto-provisioning.

alter table public.store_members
  add column if not exists removed_at timestamptz;
