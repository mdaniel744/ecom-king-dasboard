import { auth } from "@clerk/nextjs/server";
import { getCurrentStore } from "@/lib/get-current-store";
import { getTeamMembers } from "@/app/dashboard/settings/team-actions";
import { TeamSection } from "@/app/dashboard/settings/team-section";
import { SettingsForm } from "@/app/dashboard/settings/settings-form";

export default async function SettingsPage() {
  const [{ userId }, store, members] = await Promise.all([
    auth(),
    getCurrentStore(),
    getTeamMembers(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Store profile, notifications, and team access
      </p>

      <nav aria-label="Settings sections" className="mt-4 flex flex-wrap gap-2">
        {[
          ["Store profile", "#store-profile"],
          ["Email notifications", "#email-notifications"],
          ["Team access", "#team-access"],
        ].map(([label, href]) => (
          <a
            key={href}
            href={href}
            className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary"
          >
            {label}
          </a>
        ))}
      </nav>

      <SettingsForm store={store} />

      <div id="team-access" className="mt-6 max-w-3xl scroll-mt-6">
        <TeamSection
          members={members}
          isCurrentUserOwner={userId === store.owner_user_id}
        />
      </div>
    </div>
  );
}
