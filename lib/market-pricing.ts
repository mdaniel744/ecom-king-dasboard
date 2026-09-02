import "server-only";

import { defaultCurrencyForMarket } from "@/lib/merchant-locales";
import type { Store } from "@/lib/types";

const ECB_REFERENCE_RATES_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=csvdata";
const RATE_CACHE_SECONDS = 60 * 60;
const MAX_RATE_AGE_MS = 10 * 24 * 60 * 60 * 1000;

export class CurrencyConversionError extends Error {}

export type MarketPricingStore = Pick<Store, "market_currencies" | "vat_rates">;

export type MarketPrice = {
  amount: number;
  netAmount: number;
  currency: string;
  vatRate: number;
  exchangeRate: number;
  rateDate: string | null;
  rateSource: "ECB" | null;
};

export type MarketPriceConverter = {
  market: string;
  currency: string;
  vatRate: number;
  convert: (price: number, sourceCurrency: string) => MarketPrice;
};

type EcbReferenceRates = {
  rates: Record<string, number>;
  observedAt: Record<string, string>;
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current);
  return values;
}

async function getEcbReferenceRates(): Promise<EcbReferenceRates> {
  let response: Response;
  try {
    response = await fetch(ECB_REFERENCE_RATES_URL, {
      headers: { Accept: "text/csv" },
      next: { revalidate: RATE_CACHE_SECONDS },
    });
  } catch {
    throw new CurrencyConversionError(
      "The ECB exchange-rate service is temporarily unavailable. Try again shortly."
    );
  }

  if (!response.ok) {
    throw new CurrencyConversionError(
      `The ECB exchange-rate service returned ${response.status}. Try again later.`
    );
  }

  const lines = (await response.text()).trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0] ?? "").map((header) => header.replace(/^\uFEFF/, ""));
  const currencyIndex = headers.indexOf("CURRENCY");
  const valueIndex = headers.indexOf("OBS_VALUE");
  const dateIndex = headers.indexOf("TIME_PERIOD");
  if (currencyIndex < 0 || valueIndex < 0 || dateIndex < 0) {
    throw new CurrencyConversionError("The ECB exchange-rate response had an unexpected format.");
  }

  const rates: Record<string, number> = { EUR: 1 };
  const observedAt: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const columns = parseCsvLine(line);
    const currency = columns[currencyIndex]?.trim().toUpperCase();
    const value = Number(columns[valueIndex]);
    const date = columns[dateIndex]?.trim();
    if (currency && date && Number.isFinite(value) && value > 0) {
      rates[currency] = value;
      observedAt[currency] = date;
    }
  }

  const latestDate = Object.values(observedAt).sort().at(-1);
  if (!latestDate) {
    throw new CurrencyConversionError("The ECB exchange-rate response contained no observations.");
  }
  observedAt.EUR = latestDate;

  return { rates, observedAt };
}

function roundForCurrency(amount: number, currency: string): number {
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    // Three-letter codes are validated before this point; two decimals is a safe fallback.
  }
  const factor = 10 ** digits;
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

/**
 * Converts a VAT-exclusive product price into the configured currency for a
 * delivery market, then adds that market's VAT. ECB observations are quoted
 * as currency units per EUR, so cross rates are calculated through EUR.
 */
export async function convertPriceForMarket(
  price: number,
  sourceCurrency: string,
  market: string,
  store: MarketPricingStore
): Promise<MarketPrice> {
  const converter = await createMarketPriceConverter(market, store, [sourceCurrency]);
  return converter.convert(price, sourceCurrency);
}

function referenceRate(
  snapshot: EcbReferenceRates,
  currency: string
): { rate: number; date: string } {
  const rate = snapshot.rates[currency];
  const date = snapshot.observedAt[currency];
  if (!rate || !date) {
    throw new CurrencyConversionError(
      `Automatic conversion for ${currency} is not available from the ECB reference-rate feed.`
    );
  }

  const observedTime = Date.parse(`${date}T23:59:59Z`);
  if (!Number.isFinite(observedTime) || Date.now() - observedTime > MAX_RATE_AGE_MS) {
    throw new CurrencyConversionError(
      `The latest ${currency} reference rate is too old to use safely.`
    );
  }
  return { rate, date };
}

/** Builds one converter for a storefront request so a whole product grid
 * shares the same official rate snapshot. Prices remain stored once in their
 * input currency; the customer-facing values are calculated on demand. */
export async function createMarketPriceConverter(
  market: string,
  store: MarketPricingStore,
  sourceCurrencies: string[] = []
): Promise<MarketPriceConverter> {
  const normalizedMarket = market.trim().toUpperCase();
  const target =
    store.market_currencies?.[normalizedMarket]?.toUpperCase() ||
    defaultCurrencyForMarket(normalizedMarket);
  const vatRate = store.vat_rates?.[normalizedMarket] ?? 0;
  const needsConversion = sourceCurrencies.some(
    (currency) => currency.trim().toUpperCase() !== target
  );
  const snapshot = needsConversion ? await getEcbReferenceRates() : null;

  return {
    market: normalizedMarket,
    currency: target,
    vatRate,
    convert(price: number, sourceCurrency: string): MarketPrice {
      if (!Number.isFinite(price) || price < 0) {
        throw new CurrencyConversionError("A valid non-negative product price is required.");
      }

      const source = sourceCurrency.trim().toUpperCase();
      let convertedNet = price;
      let exchangeRate = 1;
      let rateDate: string | null = null;
      let rateSource: "ECB" | null = null;

      if (source !== target) {
        if (!snapshot) {
          throw new CurrencyConversionError(
            `No exchange-rate snapshot was loaded for ${source} to ${target}.`
          );
        }
        const sourceReference = referenceRate(snapshot, source);
        const targetReference = referenceRate(snapshot, target);
        exchangeRate = targetReference.rate / sourceReference.rate;
        convertedNet = price * exchangeRate;
        rateDate = [sourceReference.date, targetReference.date].sort()[0];
        rateSource = "ECB";
      }

      const netAmount = roundForCurrency(convertedNet, target);
      const gross = convertedNet * (1 + vatRate / 100);
      return {
        amount: roundForCurrency(gross, target),
        netAmount,
        currency: target,
        vatRate,
        exchangeRate,
        rateDate,
        rateSource,
      };
    },
  };
}
