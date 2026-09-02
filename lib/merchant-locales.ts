import type { Store } from "@/lib/types";

// Curated subsets of Google Merchant's supported content languages and
// target countries (feed labels). Not exhaustive — Google supports more —
// but covers the common ones. Add more here if a store needs one we're
// missing rather than switching this back to free text.

export const CONTENT_LANGUAGE_OPTIONS = [
  { value: "en", label: "English (en)" },
  { value: "de", label: "German (de)" },
  { value: "fr", label: "French (fr)" },
  { value: "es", label: "Spanish (es)" },
  { value: "it", label: "Italian (it)" },
  { value: "nl", label: "Dutch (nl)" },
  { value: "pt", label: "Portuguese (pt)" },
  { value: "pl", label: "Polish (pl)" },
  { value: "sv", label: "Swedish (sv)" },
  { value: "da", label: "Danish (da)" },
  { value: "no", label: "Norwegian (no)" },
  { value: "fi", label: "Finnish (fi)" },
  { value: "cs", label: "Czech (cs)" },
  { value: "ja", label: "Japanese (ja)" },
  { value: "zh", label: "Chinese (zh)" },
  { value: "ko", label: "Korean (ko)" },
  { value: "ar", label: "Arabic (ar)" },
  { value: "tr", label: "Turkish (tr)" },
];

export const FEED_LABEL_OPTIONS = [
  { value: "US", label: "United States (US)" },
  { value: "GB", label: "United Kingdom (GB)" },
  { value: "DE", label: "Germany (DE)" },
  { value: "FR", label: "France (FR)" },
  { value: "ES", label: "Spain (ES)" },
  { value: "IT", label: "Italy (IT)" },
  { value: "NL", label: "Netherlands (NL)" },
  { value: "PT", label: "Portugal (PT)" },
  { value: "PL", label: "Poland (PL)" },
  { value: "SE", label: "Sweden (SE)" },
  { value: "DK", label: "Denmark (DK)" },
  { value: "NO", label: "Norway (NO)" },
  { value: "FI", label: "Finland (FI)" },
  { value: "CZ", label: "Czech Republic (CZ)" },
  { value: "JP", label: "Japan (JP)" },
  { value: "CN", label: "China (CN)" },
  { value: "KR", label: "South Korea (KR)" },
  { value: "AE", label: "United Arab Emirates (AE)" },
  { value: "TR", label: "Turkey (TR)" },
  { value: "CA", label: "Canada (CA)" },
  { value: "AU", label: "Australia (AU)" },
];

export const DEFAULT_MARKET_CURRENCIES: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  PT: "EUR",
  PL: "PLN",
  SE: "SEK",
  DK: "DKK",
  NO: "NOK",
  FI: "EUR",
  CZ: "CZK",
  JP: "JPY",
  CN: "CNY",
  KR: "KRW",
  AE: "AED",
  TR: "TRY",
  CA: "CAD",
  AU: "AUD",
};

export const DEFAULT_MARKET_LOCALES: Record<string, string> = {
  US: "en",
  GB: "en",
  DE: "de",
  FR: "fr",
  ES: "es",
  IT: "it",
  NL: "nl",
  PT: "pt",
  PL: "pl",
  SE: "sv",
  DK: "da",
  NO: "no",
  FI: "fi",
  CZ: "cs",
  JP: "ja",
  CN: "zh",
  KR: "ko",
  AE: "ar",
  TR: "tr",
  CA: "en",
  AU: "en",
};

export function defaultCurrencyForMarket(market: string): string {
  return DEFAULT_MARKET_CURRENCIES[market] ?? "USD";
}

export function defaultLocaleForMarket(
  market: string,
  availableLocales: string[]
): string | null {
  const locale = DEFAULT_MARKET_LOCALES[market];
  return locale && availableLocales.includes(locale) ? locale : null;
}

type LocaleMarketStore = Pick<
  Store,
  | "google_content_language"
  | "google_feed_label"
  | "google_feed_labels"
  | "locale_markets"
>;

export function getStoreMarkets(store: LocaleMarketStore): string[] {
  return store.google_feed_labels?.length
    ? store.google_feed_labels
    : [store.google_feed_label];
}

/** Resolve a storefront locale (including values such as en-GB) to one of
 * this store's configured delivery markets. Only an explicit mapping saved
 * in Delivery Markets activates locale-driven pricing. */
export function resolveStorefrontMarket(
  store: LocaleMarketStore,
  requestedLocale: string
): string | null {
  const locale = requestedLocale.trim().toLowerCase();
  const baseLocale = locale.split("-")[0];
  const markets = getStoreMarkets(store);
  const explicitMarket = store.locale_markets?.[locale] ?? store.locale_markets?.[baseLocale];

  if (explicitMarket && markets.includes(explicitMarket)) return explicitMarket;
  return null;
}

export type MarketPricingSetting = {
  market: string;
  currency: string;
  vatRate: number;
};

export function getStoreMarketPricing(
  store: Pick<Store, "google_feed_label" | "google_feed_labels" | "market_currencies" | "vat_rates">
): MarketPricingSetting[] {
  const markets = store.google_feed_labels?.length
    ? store.google_feed_labels
    : [store.google_feed_label];

  return markets.map((market) => ({
    market,
    currency: store.market_currencies?.[market] ?? defaultCurrencyForMarket(market),
    vatRate: store.vat_rates?.[market] ?? 0,
  }));
}

export function getPrimaryStoreCurrency(
  store: Pick<Store, "google_feed_label" | "google_feed_labels" | "market_currencies" | "vat_rates">
): string {
  return getStoreMarketPricing(store)[0]?.currency ?? "USD";
}
