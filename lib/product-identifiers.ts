export type ProductIdentifierInput = {
  mpn?: string | null;
  reference_number?: string | null;
};

/**
 * Returns the MPN sent to Google Merchant Center.
 *
 * A deliberately entered MPN takes priority. When it is absent, the public
 * product reference/model number is the safest automatic fallback because it
 * already identifies the exact product model.
 */
export function resolveProductMpn(product: ProductIdentifierInput): string | null {
  return product.mpn?.trim() || product.reference_number?.trim() || null;
}
