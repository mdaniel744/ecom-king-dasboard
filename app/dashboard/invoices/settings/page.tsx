import { getCurrentStore } from "@/lib/get-current-store";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { getPaymentSettings } from "@/lib/payment-settings";
import { InvoiceSectionNav } from "@/app/dashboard/invoices/invoice-section-nav";
import { InvoiceSettingsForm } from "@/app/dashboard/invoices/settings/invoice-settings-form";
import { isLocalDemoMode } from "@/lib/local-demo";

export default async function InvoiceSettingsPage() {
  const store = await getCurrentStore();
  const [settings, paymentSettings] = await Promise.all([
    getInvoiceSettings(store),
    getPaymentSettings(store.id),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Invoice Layout & Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Design complete customer invoices for {store.name}, including payment terms and legal company details
      </p>
      <InvoiceSectionNav active="settings" />

      <div className="mt-6">
        <InvoiceSettingsForm
          initialSettings={settings}
          storeName={store.name}
          storeEmail={store.notification_email}
          paymentSettings={paymentSettings}
          isLocalDemo={isLocalDemoMode}
        />
      </div>
    </div>
  );
}
