import test from "node:test";
import assert from "node:assert/strict";
import { resolveRequestedStorefrontMarket } from "../lib/merchant-locales.ts";
import { KARIV_GLAMOUR_STORE_ID } from "../lib/tenant-ids.js";

const kariv = {
  id: KARIV_GLAMOUR_STORE_ID,
  google_content_language: "en",
  google_feed_label: "DE",
  google_feed_labels: ["DE", "CZ"],
  locale_markets: { en: "DE", de: "DE", cs: "CZ" },
};

test("Kariv language alone selects the allowed currency market", () => {
  assert.equal(resolveRequestedStorefrontMarket(kariv, "cs"), "CZ");
  assert.equal(resolveRequestedStorefrontMarket(kariv, "cs-CZ"), "CZ");
  assert.equal(resolveRequestedStorefrontMarket(kariv, "en"), "DE");
  assert.equal(resolveRequestedStorefrontMarket(kariv, "de"), "DE");
});

test("Kariv rejects market overrides that disagree with the selected language", () => {
  assert.equal(resolveRequestedStorefrontMarket(kariv, "en", "CZ"), null);
  assert.equal(resolveRequestedStorefrontMarket(kariv, "cs", "DE"), null);
  assert.equal(resolveRequestedStorefrontMarket(kariv, "cs", "CZ"), "CZ");
  assert.equal(resolveRequestedStorefrontMarket(kariv, "fr"), null);
});

test("other tenants keep the generic explicit-market behavior", () => {
  const other = { ...kariv, id: "00000000-0000-4000-8000-000000000999" };
  assert.equal(resolveRequestedStorefrontMarket(other, "en", "CZ"), "CZ");
});
