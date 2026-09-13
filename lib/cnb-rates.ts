export type CnbReferenceRateSnapshot = {
  rates: Record<string, number>;
  observedAt: Record<string, string>;
  source: "CNB";
};

function cnbDateToIso(value: string): string | null {
  const timestamp = Date.parse(`${value.trim()} UTC`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

/** Parse CNB daily.txt and normalize its CZK-per-amount quotes to currency
 * units per CZK, matching the cross-rate convention used by market pricing. */
export function parseCnbReferenceRates(text: string): CnbReferenceRateSnapshot {
  const lines = text.trim().split(/\r?\n/);
  const observedDate = cnbDateToIso((lines[0] ?? "").replace(/\s+#.*$/, ""));
  if (!observedDate) throw new Error("The Czech National Bank rate date could not be read.");

  const rates: Record<string, number> = { CZK: 1 };
  const observedAt: Record<string, string> = { CZK: observedDate };
  for (const line of lines.slice(2)) {
    const columns = line.split("|");
    const amount = Number(columns[2]);
    const code = columns[3]?.trim().toUpperCase();
    const czkRate = Number(columns[4]);
    if (code && Number.isFinite(amount) && amount > 0 && Number.isFinite(czkRate) && czkRate > 0) {
      rates[code] = amount / czkRate;
      observedAt[code] = observedDate;
    }
  }
  if (!rates.EUR) throw new Error("The Czech National Bank response did not contain an EUR rate.");
  return { rates, observedAt, source: "CNB" };
}
