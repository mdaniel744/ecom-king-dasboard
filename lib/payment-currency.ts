import type { PaymentSettings } from "@/lib/types";

export function supportedBankCurrencies(
  settings: Pick<PaymentSettings, "bank_currency" | "bank_supported_currencies">
): string[] {
  const configured = (settings.bank_supported_currencies ?? [])
    .map((currency) => currency.trim().toUpperCase())
    .filter((currency) => /^[A-Z]{3}$/.test(currency));
  return configured.length > 0
    ? Array.from(new Set(configured))
    : [settings.bank_currency.trim().toUpperCase()];
}

export function bankTransferForCurrency(
  settings: Pick<
    PaymentSettings,
    "bank_currency" | "bank_supported_currencies" | "bank_currency_instructions"
  >,
  orderCurrency: string
) {
  const currency = orderCurrency.trim().toUpperCase();
  const supportedCurrencies = supportedBankCurrencies(settings);
  return {
    currency,
    supported: supportedCurrencies.includes(currency),
    supportedCurrencies,
    instructions: settings.bank_currency_instructions?.[currency]?.trim() || null,
  };
}
