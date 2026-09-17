import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PRODUCT_PAGE_SIZE,
  parseProductPage,
  parseProductPageSize,
  productsListHref,
} from "../lib/product-list-pagination.ts";

test("product list pagination defaults safely", () => {
  assert.equal(parseProductPage(undefined), 1);
  assert.equal(parseProductPage("0"), 1);
  assert.equal(parseProductPage("invalid"), 1);
  assert.equal(parseProductPageSize("75"), DEFAULT_PRODUCT_PAGE_SIZE);
});

test("product list pagination accepts supported positions", () => {
  assert.equal(parseProductPage("7"), 7);
  assert.equal(parseProductPage(["4", "9"]), 4);
  assert.equal(parseProductPageSize("100"), 100);
  assert.equal(parseProductPageSize("250"), 250);
});

test("product list href preserves page and page size", () => {
  assert.equal(productsListHref(6, 100), "/dashboard/products?page=6&pageSize=100");
});
