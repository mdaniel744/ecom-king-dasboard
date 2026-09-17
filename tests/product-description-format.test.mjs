import test from "node:test";
import assert from "node:assert/strict";
import { productDescriptionTextToHtml } from "../lib/product-description-format.ts";

test("AI product description sections and specifications become scannable HTML", () => {
  const html = productDescriptionTextToHtml(
    "A factual opening paragraph.\n\nKey Specifications:\n- Material: Stainless steel\n- Size: 40 mm\n\nUtility & Compatibility:\nDesigned for the supplied compatible fitting."
  );

  assert.equal(html.includes("<p>A factual opening paragraph.</p>"), true);
  assert.equal(html.includes("<h3>Key Specifications:</h3>"), true);
  assert.equal(html.includes("<ul>"), true);
  assert.equal(html.includes("<strong>Material:</strong> Stainless steel"), true);
  assert.equal(html.includes("<h3>Utility &amp; Compatibility:</h3>"), true);
});

test("generated content is escaped before rich formatting is added", () => {
  const html = productDescriptionTextToHtml("- Material: <script>alert('x')</script>");
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
});
