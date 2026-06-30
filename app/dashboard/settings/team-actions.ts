"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { StoreMemberRole } from "@/lib/types";

export type TeamMember = {
  userId: string;
  email: string;
  name: string | null;
  role: StoreMemberRole;
  isOwner: boolean;
};

/**
 * Resolves a store's store_members rows into display-ready info by looking
 * each user up in Clerk (this app has no local users table — Clerk is the
 * single source of truth for identity, Supabase only knows the store_id
 * relationship).
 */
export async function getTeamMembers(): Promise<TeamMember[]> {
  const store = await getCurrentStore();

  const { data: members, error } = await supabaseAdmin
    .from("store_members")
    .select("user_id, role")
    .eq("store_id", store.id);

  if (error || !members?.length) return [];

  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({
    userId: members.map((m) => m.user_id),
    limit: members.length,
  });

  return members.map((member) => {
    const user = users.find((u) => u.id === member.user_id);
    return {
      userId: member.user_id,
      email: user?.primaryEmailAddress?.emailAddress ?? "(unknown user)",
      name: user?.fullName ?? null,
      role: member.role as StoreMemberRole,
      isOwner: member.user_id === store.owner_user_id,
    };
  });
}

type InviteResult = { success: boolean; error?: string };

export async function inviteTeammate(formData: FormData): Promise<InviteResult> {
  const { userId } = await auth();
  const store = await getCurrentStore();

  if (userId !== store.owner_user_id) {
    return { success: false, error: "Only the store owner can invite teammates." };
  }

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) return { success: false, error: "Enter an email address." };

  const role = (formData.get("role") as string) === "staff" ? "staff" : "manager";

  const client = await clerkClient();
  const { data: matches } = await client.users.getUserList({ emailAddress: [email] });

  if (matches.length === 0) {
    return {
      success: false,
      error:
        "No Clerk account exists with that email yet. Create one in the Clerk dashboard first, then invite them here.",
    };
  }

  const invitedUserId = matches[0].id;

  const { data: existingMembership } = await supabaseAdmin
    .from("store_members")
    .select("store_id")
    .eq("user_id", invitedUserId)
    .maybeSingle();

  if (existingMembership?.store_id === store.id) {
    return { success: false, error: "This person is already a teammate on this store." };
  }
  if (existingMembership) {
    return {
      success: false,
      error: "This person already belongs to a different store on this platform.",
    };
  }

  const { error: insertError } = await supabaseAdmin
    .from("store_members")
    .insert({ store_id: store.id, user_id: invitedUserId, role });

  if (insertError) {
    return { success: false, error: `Failed to add teammate: ${insertError.message}` };
  }

  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function removeTeammate(targetUserId: string): Promise<InviteResult> {
  const { userId } = await auth();
  const store = await getCurrentStore();

  if (userId !== store.owner_user_id) {
    return { success: false, error: "Only the store owner can remove teammates." };
  }
  if (targetUserId === store.owner_user_id) {
    return { success: false, error: "The store owner can't be removed." };
  }

  const { error } = await supabaseAdmin
    .from("store_members")
    .delete()
    .eq("store_id", store.id)
    .eq("user_id", targetUserId);

  if (error) return { success: false, error: `Failed to remove teammate: ${error.message}` };

  revalidatePath("/dashboard/settings");
  return { success: true };
}
