import { getCurrentStore } from "@/lib/get-current-store";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { getPaymentSettings } from "@/lib/payment-settings";
import { InvoiceSectionNav } from "@/app/dashboard/invoices/invoice-section-nav";
import { InvoiceSettingsForm } from "@/app/dashboard/invoices/settings/invoice-settings-form";
import { isLocalDemoMode } from "@/lib/local-demo";
import { getStoreMarketPricing } from "@/lib/merchant-locales";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { InvoiceOrderPreview } from "@/lib/checkout-invoice-amounts";

export default async function InvoiceSettingsPage() {
  const store = await getCurrentStore();
  const [settings, paymentSettings, orderPreview] = await Promise.all([
    getInvoiceSettings(store),
    getPaymentSettings(store.id),
    supabaseAdmin.from("checkout_orders")
      .select("id,order_number,invoice_number,created_at,customer_name,billing_address,delivery_address,line_items,currency,locale,subtotal,discount_amount,shipping_amount,tax_amount,tax_rate,total_amount")
      .eq("store_id", store.id).order("created_at", { ascending: false }).limit(50),
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
          markets={getStoreMarketPricing(store)}
          isLocalDemo={isLocalDemoMode}
          previewOrders={(orderPreview.data ?? []) as InvoiceOrderPreview[]}
          previewOrdersError={Boolean(orderPreview.error)}
        />
      </div>
    </div>
  );
}
