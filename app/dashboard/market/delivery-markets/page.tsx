import { getCurrentStore } from "@/lib/get-current-store";
import { SettingsForm } from "@/app/dashboard/settings/settings-form";

export default async function DeliveryMarketsPage() {
  const store = await getCurrentStore();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Delivery Markets</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure where products can be delivered, regional VAT, and storefront product links.
      </p>

      <SettingsForm store={store} section="delivery-markets" />
    </div>
  );
}
