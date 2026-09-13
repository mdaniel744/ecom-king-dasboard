import test from "node:test";
import assert from "node:assert/strict";
import { parseCnbReferenceRates } from "../lib/cnb-rates.ts";

test("CNB daily rates preserve the official EUR/CZK cross rate", () => {
  const snapshot = parseCnbReferenceRates([
    "11 Sep 2026 #180",
    "Country|Currency|Amount|Code|Rate",
    "EMU|euro|1|EUR|24.260",
    "Japan|yen|100|JPY|16.200",
  ].join("\n"));

  assert.equal(snapshot.source, "CNB");
  assert.equal(snapshot.observedAt.EUR, "2026-09-11");
  assert.equal(snapshot.rates.CZK / snapshot.rates.EUR, 24.26);
  assert.equal(snapshot.rates.JPY, 100 / 16.2);
});

test("CNB parser refuses a feed without an EUR reference", () => {
  assert.throws(() => parseCnbReferenceRates([
    "11 Sep 2026 #180",
    "Country|Currency|Amount|Code|Rate",
    "Japan|yen|100|JPY|16.200",
  ].join("\n")), /EUR rate/);
});
