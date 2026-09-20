import test from "node:test";
import assert from "node:assert/strict";
import { resolveProductMpn } from "../lib/product-identifiers.ts";

test("an explicit MPN takes priority over the reference number", () => {
  assert.equal(
    resolveProductMpn({ mpn: "MPN-900", reference_number: "REF-100" }),
    "MPN-900"
  );
});

test("the product reference number becomes the Google MPN when MPN is empty", () => {
  assert.equal(resolveProductMpn({ mpn: null, reference_number: "REF-100" }), "REF-100");
});

test("identifier whitespace is normalized and blank values remain absent", () => {
  assert.equal(resolveProductMpn({ mpn: "  ", reference_number: " REF-100 " }), "REF-100");
  assert.equal(resolveProductMpn({ mpn: " ", reference_number: null }), null);
});
