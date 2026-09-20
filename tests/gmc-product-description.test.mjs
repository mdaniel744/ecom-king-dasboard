import test from "node:test";
import assert from "node:assert/strict";
import { validateProductDescription } from "../lib/gmc-description-policy.ts";

test("safe factual product copy passes the GMC policy check", () => {
  const result = validateProductDescription(
    "Stainless steel case with a 40 mm diameter, automatic movement, and blue dial."
  );
  assert.equal(result.isValid, true);
  assert.deepEqual(result.flaggedTerms, []);
  assert.equal(result.cleanedText.includes("40 mm"), true);
});

test("all required forbidden categories are detected case-insensitively", () => {
  const result = validateProductDescription(
    "BUY NOW at the best price with a money-back guarantee and FREE SHIPPING."
  );
  assert.equal(result.isValid, false);
  assert.deepEqual(result.flaggedTerms, [
    "BUY NOW",
    "best price",
    "money-back",
    "guarantee",
    "FREE SHIPPING",
  ]);
});

test("every configured forbidden phrase is removed by the sanitizer", () => {
  const forbiddenPhrases = [
    "buy now",
    "for sale",
    "order today",
    "shop now",
    "add to cart",
    "click here",
    "limited offer",
    "limited stock",
    "special deal",
    "special offer",
    "cheap",
    "affordable",
    "discount",
    "discounted",
    "best price",
    "lowest price",
    "sale price",
    "best deal",
    "bargain",
    "clearance",
    "save 25%",
    "guarantee",
    "guaranteed",
    "lifetime warranty",
    "money-back",
    "satisfaction guaranteed",
    "risk-free",
    "100% money back",
    "100% guaranteed",
    "free shipping",
    "free delivery",
    "fast delivery",
    "same-day delivery",
    "next-day delivery",
    "express shipping",
    "easy returns",
    "30-day return",
  ];

  for (const phrase of forbiddenPhrases) {
    const result = validateProductDescription(`Product specification. ${phrase}.`);
    assert.equal(result.isValid, false, `Expected ${phrase} to be flagged`);
    assert.equal(
      validateProductDescription(result.cleanedText).isValid,
      true,
      `Expected ${phrase} to be removed`
    );
  }
});

test("cleaned text removes every forbidden match while preserving HTML", () => {
  const result = validateProductDescription(
    "<p>For sale with special deal pricing.</p><p>Easy returns and save 20%.</p>"
  );
  const secondPass = validateProductDescription(result.cleanedText);
  assert.equal(secondPass.isValid, true);
  assert.equal(result.cleanedText.includes("<p>"), true);
  assert.equal(result.cleanedText.includes("</p>"), true);
  assert.equal(result.cleanedText.includes("%"), false);
});
