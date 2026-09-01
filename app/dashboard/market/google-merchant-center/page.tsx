import { getCurrentStore } from "@/lib/get-current-store";
import { SettingsForm } from "@/app/dashboard/settings/settings-form";

export default async function GoogleMerchantCenterPage() {
  const store = await getCurrentStore();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Google Merchant Center</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect Merchant Center, manage translations, and choose which languages are pushed to Google.
      </p>

      <SettingsForm store={store} section="google-merchant-center" />
    </div>
  );
}
