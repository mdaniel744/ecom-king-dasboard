import type { PaymentSettings } from "@/lib/types";

export function defaultPaymentSettings(storeId: string): PaymentSettings {
  return {
    store_id: storeId,
    bank_transfer_enabled: true,
    bank_name: null,
    bank_account_name: null,
    bank_account_number: null,
    bank_country: null,
    bank_currency: "USD",
    bank_iban: null,
    bank_swift_bic: null,
    bank_instructions:
      "Use your order or invoice number as the transfer reference. Orders are processed after payment is confirmed.",
    card_enabled: false,
    card_provider: null,
    card_checkout_label: "Pay securely by card",
    crypto_enabled: false,
    crypto_assets: [],
    crypto_wallet_details: null,
    created_at: null,
    updated_at: null,
  };
}
