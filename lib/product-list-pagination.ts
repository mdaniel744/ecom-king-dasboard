export const DEFAULT_PRODUCT_PAGE_SIZE = 50;
export const PRODUCT_PAGE_SIZE_OPTIONS = [50, 100, 250] as const;

export type ProductPageSize = (typeof PRODUCT_PAGE_SIZE_OPTIONS)[number];
export type ProductListQueryValue = string | string[] | undefined;

function firstValue(value: ProductListQueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseProductPage(value: ProductListQueryValue): number {
  const parsed = Number.parseInt(firstValue(value) ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function parseProductPageSize(value: ProductListQueryValue): ProductPageSize {
  const parsed = Number.parseInt(firstValue(value) ?? "", 10);
  return PRODUCT_PAGE_SIZE_OPTIONS.includes(parsed as ProductPageSize)
    ? (parsed as ProductPageSize)
    : DEFAULT_PRODUCT_PAGE_SIZE;
}

export function productsListHref(page: number, pageSize: ProductPageSize): string {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const params = new URLSearchParams({
    page: String(safePage),
    pageSize: String(pageSize),
  });
  return `/dashboard/products?${params.toString()}`;
}
