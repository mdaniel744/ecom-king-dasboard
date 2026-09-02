import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { defaultCurrencyForMarket } from "@/lib/merchant-locales";
import type { Store } from "@/lib/types";

const ECB_REFERENCE_RATES_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=csvdata";
const RATE_CACHE_SECONDS = 60 * 60;
const MAX_RATE_AGE_MS = 10 * 24 * 60 * 60 * 1000;
// How old our own cached rates can get before a request opportunistically
// kicks off a background refresh for next time -- deliberately shorter than
// RATE_CACHE_SECONDS so a refresh is already in flight before the row would
// be considered stale by anything reading fetched_at directly.
const REFRESH_STALE_AFTER_MS = 50 * 60 * 1000;

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

/**
 * Fetches live rates from ECB and writes them into our own cache table.
 * Never called from a customer-facing request path directly -- only from
 * getCachedEcbReferenceRates()'s background refresh (fire-and-forget) or its
 * one-time bootstrap path (cache table genuinely empty). Errors are swallowed
 * by the caller when fired in the background; the caller awaiting bootstrap
 * lets them propagate, since there's nothing to fall back to that first time.
 */
async function refreshExchangeRateCache(): Promise<EcbReferenceRates> {
  const snapshot = await getEcbReferenceRates();
  const rows = Object.entries(snapshot.rates).map(([currency, rate]) => ({
    currency,
    rate,
    observed_at: snapshot.observedAt[currency] ?? snapshot.observedAt.EUR,
  }));
  const { error } = await supabaseAdmin.from("exchange_rate_cache").upsert(rows, { onConflict: "currency" });
  if (error) throw new CurrencyConversionError(`Failed to update the exchange rate cache: ${error.message}`);
  return snapshot;
}

let refreshInFlight: Promise<EcbReferenceRates> | null = null;

/** De-dupes concurrent background refresh triggers -- several requests
 * noticing a stale cache in the same moment should kick off one real ECB
 * call, not one per request. */
function triggerBackgroundRefresh(): void {
  if (refreshInFlight) return;
  refreshInFlight = refreshExchangeRateCache()
    .catch((error) => {
      // Deliberately swallowed -- a background refresh failing must never
      // surface to (or block) whatever customer request triggered it. The
      // cache just stays at its last known-good value until the next
      // opportunistic trigger succeeds.
      console.error("Background exchange rate refresh failed:", error);
      return null as unknown as EcbReferenceRates;
    })
    .finally(() => {
      refreshInFlight = null;
    });
}

/**
 * The only rate source the customer-facing pricing/checkout path should ever
 * call. Always reads our own cache table (a single indexed query, no
 * network round trip to ECB) -- so a request is never blocked by ECB being
 * slow, which is the whole reason this cache exists (see the 13s cold-fetch
 * latency that broke a real Olborg checkout).
 *
 * Bootstrap case (cache table has no rows at all yet, e.g. right after this
 * migration ran) does one real, synchronous ECB fetch so the very first
 * request isn't left with nothing -- every request after that reads the
 * cache. Otherwise, returns whatever's cached immediately and, if it's
 * older than REFRESH_STALE_AFTER_MS, kicks off a background refresh without
 * waiting for it -- this request still uses the (still valid, just not
 * freshly-verified) cached value.
 */
async function getCachedEcbReferenceRates(): Promise<EcbReferenceRates> {
  const { data, error } = await supabaseAdmin
    .from("exchange_rate_cache")
    .select("currency, rate, observed_at, fetched_at");
  if (error) throw new CurrencyConversionError(`Exchange rate cache could not be read: ${error.message}`);

  if (!data || data.length === 0) {
    return refreshExchangeRateCache();
  }

  const rates: Record<string, number> = {};
  const observedAt: Record<string, string> = {};
  let oldestFetch = Infinity;
  for (const row of data) {
    rates[row.currency] = Number(row.rate);
    observedAt[row.currency] = row.observed_at;
    oldestFetch = Math.min(oldestFetch, new Date(row.fetched_at).getTime());
  }

  if (Date.now() - oldestFetch > REFRESH_STALE_AFTER_MS) {
    triggerBackgroundRefresh();
  }

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
  const snapshot = needsConversion ? await getCachedEcbReferenceRates() : null;

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
