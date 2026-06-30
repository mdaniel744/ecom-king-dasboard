import "server-only";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Store } from "@/lib/types";

/**
 * Resolves the store the signed-in user belongs to. If they have no
 * membership yet (first login), a store is auto-provisioned for them
 * and they're made its owner. This keeps the dashboard usable end-to-end
 * before a dedicated "invite client to store" admin flow exists.
 *
 * Wrapped in React's cache() so layout + page calls within the same
 * request share one Supabase round trip instead of duplicating it.
 */
export const getCurrentStore = cache(async (): Promise<Store> => {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("store_members")
    .select("store_id, stores(*)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`Failed to load store membership: ${membershipError.message}`);
  }

  if (membership?.stores) {
    return membership.stores as unknown as Store;
  }

  // Deliberately not calling currentUser() here — it's an extra network
  // round trip to Clerk's API just to personalize the default name, and
  // a failure there used to crash the entire first-time provisioning
  // flow. The store can be renamed in Settings afterward anyway.
  const storeName = "My Store";
  const slug = `store-${randomUUID().slice(0, 8)}`;

  // Upsert with ignoreDuplicates relies on the unique constraint on
  // owner_user_id: if two requests race here, only one row is ever
  // inserted — the loser's upsert is a no-op rather than a duplicate.
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
