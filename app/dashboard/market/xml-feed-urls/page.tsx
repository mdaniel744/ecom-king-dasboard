import { getCurrentStore } from "@/lib/get-current-store";
import { SettingsForm } from "@/app/dashboard/settings/settings-form";

export default async function XmlFeedUrlsPage() {
  const store = await getCurrentStore();

  return (
    <div>
      <h1 className="text-2xl font-semibold">XML Feed URLs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Copy the product feed address for each configured market and language.
      </p>

      <SettingsForm store={store} section="xml-feed-urls" />
    </div>
  );
}
