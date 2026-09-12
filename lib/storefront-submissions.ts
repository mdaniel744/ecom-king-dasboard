import { z } from "zod";
import type { CustomerAddress, FormFieldData, Product, Store } from "@/lib/types";

export const formFieldValueSchema = z.union([
  z.string().trim().max(4000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.string().trim().max(1000)).max(50),
]);

export const formFieldDataSchema = z
  .record(z.string().trim().min(1).max(120), formFieldValueSchema)
  .refine((value) => Object.keys(value).length <= 100, "Maximum 100 additional fields");

export const customerAddressSchema = z
  .object({
    title: z.string().trim().max(50).optional(),
    first_name: z.string().trim().max(120).optional(),
    last_name: z.string().trim().max(120).optional(),
    full_name: z.string().trim().max(240).optional(),
    company: z.string().trim().max(200).optional(),
    email: z.string().trim().max(320).optional(),
    phone: z.string().trim().max(50).optional(),
    vat_number: z.string().trim().max(100).optional(),
    tax_id: z.string().trim().max(100).optional(),
    address_line_1: z.string().trim().max(300).optional(),
    address_line_2: z.string().trim().max(300).optional(),
    city: z.string().trim().max(200).optional(),
    state: z.string().trim().max(200).optional(),
    county: z.string().trim().max(200).optional(),
    postal_code: z.string().trim().max(50).optional(),
    country: z.string().trim().max(100).optional(),
    country_code: z.string().trim().toUpperCase().max(3).optional(),
    delivery_instructions: z.string().trim().max(1000).optional(),
  })
  .catchall(formFieldValueSchema);

type ProductLinkStore = Pick<
  Store,
  | "domain"
  | "google_content_language"
  | "enabled_locales"
  | "product_url_path"
  | "product_url_path_overrides"
  | "source_locale_has_prefix"
>;

export function buildStorefrontProductUrl(
  store: ProductLinkStore,
  product: Pick<Product, "slug">,
  requestedLocale?: string
) {
  if (!store.domain) return null;

  const sourceLocale = store.google_content_language || "en";
  const locale =
    requestedLocale &&
    (requestedLocale === sourceLocale || store.enabled_locales.includes(requestedLocale))
      ? requestedLocale
      : sourceLocale;
  const base = store.domain.startsWith("http") ? store.domain : `https://${store.domain}`;
  const localePrefix =
    locale === sourceLocale && !store.source_locale_has_prefix ? "" : `/${locale}`;
  const path = (
    store.product_url_path_overrides?.[locale] ||
    store.product_url_path ||
    "products"
  ).replace(/^\/+|\/+$/g, "");

  return `${base.replace(/\/$/, "")}${localePrefix}/${path}/${product.slug}`;
}

export function asCustomerAddress(
  value: z.infer<typeof customerAddressSchema> | null | undefined
): CustomerAddress | null {
  if (!value) return null;
  return Object.keys(value).length > 0 ? (value as CustomerAddress) : null;
}

export function asFormFieldData(
  value: z.infer<typeof formFieldDataSchema> | undefined
): FormFieldData {
  return (value ?? {}) as FormFieldData;
}
