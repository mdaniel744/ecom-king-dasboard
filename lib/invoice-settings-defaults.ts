import type { InvoiceSettings } from "@/lib/types";

export function defaultInvoiceSettings(
  storeId: string,
  storeName: string,
  notificationEmail: string | null = null
): InvoiceSettings {
  return {
    store_id: storeId,
    template: "modern",
    accent_color: "#111827",
    font_family: "sans",
    logo_url: null,
    business_name: storeName,
    business_address: null,
    business_email: notificationEmail,
    business_phone: null,
    business_website: null,
    company_registration_number: null,
    vat_registration_number: null,
    tax_id: null,
    account_manager_name: null,
    account_manager_email: null,
    account_manager_phone: null,
    invoice_prefix: "INV",
    due_days: 7,
    payment_terms: null,
    delivery_terms: null,
    deposit_percentage: 0,
    commercial_terms: null,
    auto_send: true,
    footer_note: "Thank you for your business.",
    show_logo: true,
    show_billing_address: true,
    show_shipping_address: true,
    show_tax_breakdown: true,
    created_at: null,
    updated_at: null,
  };
}
