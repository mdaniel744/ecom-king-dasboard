import { auth } from "@clerk/nextjs/server";
import { getCurrentStore } from "@/lib/get-current-store";
import { getTeamMembers } from "@/app/dashboard/settings/team-actions";
import { TeamSection } from "@/app/dashboard/settings/team-section";
import { SettingsForm } from "@/app/dashboard/settings/settings-form";

export default async function SettingsPage() {
  const { userId } = await auth();
  const store = await getCurrentStore();
  const members = await getTeamMembers();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Store profile and integrations
      </p>

      <SettingsForm store={store} />

      <div className="mt-6 max-w-xl">
        <TeamSection members={members} isCurrentUserOwner={userId === store.owner_user_id} />
      </div>
    </div>
  );
}
