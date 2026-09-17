import test from "node:test";
import assert from "node:assert/strict";
import { productDescriptionRevisionReasons } from "../lib/product-description-writing.ts";
import { productDescriptionTextToHtml } from "../lib/product-description-format.ts";

const overview = "This freestanding steel shelving unit provides an open arrangement for supplies in a utility room or workspace. Its adjustable shelves allow the storage layout to change when the objects being stored change, so the spacing can reflect the heights of those objects. The open sides keep the shelf contents visible from several positions, while the rectangular footprint provides a defined area to consider when planning the room layout.";
const experience = "During use, the relationship between shelf spacing and overall dimensions matters more than either measurement alone. Moving a shelf changes the available space above and below it, making it possible to arrange shorter and taller items across different levels. The black finish gives the frame a consistent appearance alongside its visible steel construction. With an external width of 80 cm and a depth of 40 cm, the unit's listed footprint can be compared with the intended position before arranging the surrounding furniture.";
const specifications = "Technical Specifications:\n- Construction: Steel\n- Finish: Black\n- External dimensions: 80 × 40 × 180 cm";

test("two developed paragraphs and a brief summary retain their structure in the editor", () => {
  const text = `${overview}\n\n${experience}\n\n${specifications}`;
  assert.deepEqual(productDescriptionRevisionReasons(text), []);
  const html = productDescriptionTextToHtml(text);
  const narrative = html.slice(0, html.indexOf("<h3>"));
  assert.equal((narrative.match(/<p>/g) ?? []).length, 2);
  assert.equal((html.match(/<li>/g) ?? []).length, 3);
  assert.ok(html.includes("<strong>Construction:</strong> Steel"));
});

test("a long attributes list triggers revision even when its word count is sufficient", () => {
  const text = `Steel shelving for a utility room.\n\nTechnical Specifications:\n${Array.from({ length: 8 }, (_, index) => `- Shelf ${index + 1}: An adjustable steel shelf with a rectangular outline and a black surface for arranging the supplied storage items.`).join("\n")}`;
  assert.ok(text.split(/\s+/).length >= 150);
  assert.ok(text.split(/\s+/).length <= 250);
  assert.ok(productDescriptionRevisionReasons(text).length > 0);
});

test("the old opening-list-utility layout is sent back for a narrative-first revision", () => {
  const text = `${overview}\n\n${specifications}\n\nUtility & Compatibility:\n${experience}`;
  assert.ok(productDescriptionRevisionReasons(text).length > 0);
});
