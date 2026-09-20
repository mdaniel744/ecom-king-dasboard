import "server-only";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isLocalDemoMode, localDemoStore } from "@/lib/local-demo";
import type { Store } from "@/lib/types";

export const getCurrentStore = cache(async (): Promise<Store> => {
  if (isLocalDemoMode) return localDemoStore;

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("store_members")
    .select("store_id, removed_at, stores(*)")
    .eq("user_id", userId);

  if (membershipError) {
    throw new Error(`Failed to load store membership: ${membershipError.message}`);
  }

  const activeMembership = (memberships ?? []).find((m) => !m.removed_at);
  if (activeMembership?.stores) {
    return activeMembership.stores as unknown as Store;
  }

  // Every row found (if any) was removed -- this person used to have
  // access and had it revoked. Never fall through to auto-provisioning for
  // them; that would silently hand them a brand-new store as its owner,
  // undoing the removal entirely instead of respecting it.
  if ((memberships ?? []).length > 0) {
    redirect("/access-revoked");
  }

  const storeName = "My Store";
  const slug = `store-${randomUUID().slice(0, 8)}`;

  const { error: upsertError } = await supabaseAdmin
    .from("stores")
    .upsert(
      { name: storeName, slug, owner_user_id: userId },
      { onConflict: "owner_user_id", ignoreDuplicates: true }
    );

  if (upsertError) {
    throw new Error(`Failed to provision store: ${upsertError.message}`);
  }

  const { data: store, error: storeError } = await supabaseAdmin
    .from("stores")
    .select("*")
    .eq("owner_user_id", userId)
    .single();

  if (storeError || !store) {
    throw new Error(`Failed to resolve provisioned store: ${storeError?.message}`);
  }

  const { error: memberError } = await supabaseAdmin
    .from("store_members")
    .upsert(
      { store_id: store.id, user_id: userId, role: "owner" },
      { onConflict: "store_id,user_id", ignoreDuplicates: true }
    );

  if (memberError) {
    throw new Error(`Failed to create store membership: ${memberError.message}`);
  }

  return store as Store;
});
