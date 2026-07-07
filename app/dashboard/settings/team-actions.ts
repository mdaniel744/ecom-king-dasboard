"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate, validateId } from "@/lib/validation";
import type { StoreMemberRole } from "@/lib/types";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(["manager", "staff"]),
});

export type TeamMember = {
  userId: string;
  email: string;
  name: string | null;
  role: StoreMemberRole;
  isOwner: boolean;
};

export async function getTeamMembers(): Promise<TeamMember[]> {
  const store = await getCurrentStore();

  const { data: members, error } = await supabaseAdmin
    .from("store_members")
    .select("user_id, role")
    .eq("store_id", store.id);

  if (error || !members?.length) return [];

  const userResults = await Promise.allSettled(
    members.map((m) => supabaseAdmin.auth.admin.getUserById(m.user_id))
  );

  return members.map((member, i) => {
    const result = userResults[i];
    const user =
      result.status === "fulfilled" ? result.value.data.user : null;
    return {
      userId: member.user_id,
      email: user?.email ?? "(unknown)",
      name: (user?.user_metadata?.full_name as string) ?? null,
      role: member.role as StoreMemberRole,
      isOwner: member.user_id === store.owner_user_id,
    };
  });
}

type InviteResult = { success: boolean; error?: string };

export async function inviteTeammate(formData: FormData): Promise<InviteResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const store = await getCurrentStore();

  if (currentUser?.id !== store.owner_user_id) {
    return { success: false, error: "Only the store owner can invite teammates." };
  }

  const emailRaw = (formData.get("email") as string) ?? "";
  const roleRaw = (formData.get("role") as string) === "staff" ? "staff" : "manager";

  const parsed = inviteSchema.safeParse({ email: emailRaw, role: roleRaw });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { email, role } = parsed.data;

  // Find existing Supabase auth user by email
  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({
    perPage: 1000,
  });
  const existingUser = usersData?.users?.find((u) => u.email === email);

  let invitedUserId: string;

  if (existingUser) {
    invitedUserId = existingUser.id;
  } else {
    // Create and email an invite link — they set their own password
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email);
    if (inviteError || !inviteData.user) {
      return {
        success: false,
        error: inviteError?.message ?? "Failed to send invite.",
      };
    }
    invitedUserId = inviteData.user.id;
  }

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
  targetUserId = validateId(targetUserId);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const store = await getCurrentStore();

  if (currentUser?.id !== store.owner_user_id) {
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
