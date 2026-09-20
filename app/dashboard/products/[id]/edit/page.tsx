import { notFound } from "next/navigation";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAttributeDefs, getAttributePresets } from "@/lib/attribute-defs";
import { ProductForm } from "@/app/dashboard/products/product-form";
import { updateProduct } from "@/app/dashboard/products/actions";
import { getPrimaryStoreCurrency, getStoreMarketPricing } from "@/lib/merchant-locales";
import { configuredProductContentLocales } from "@/lib/product-content-language";
import {
  parseProductPage,
  parseProductPageSize,
  productsListHref,
  type ProductListQueryValue,
} from "@/lib/product-list-pagination";
import type { Brand, Category, Collection, Product, ProductFamily } from "@/lib/types";

export const maxDuration = 300;

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, ProductListQueryValue>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const hasProductListContext =
    query.returnPage !== undefined || query.returnPageSize !== undefined;
  const productsHref = productsListHref(
    parseProductPage(query.returnPage),
    parseProductPageSize(query.returnPageSize)
  );
  const store = await getCurrentStore();

  const [{ data: product }, { data: categories }, { data: brands }, { data: collections }, { data: families }, attributeDefs, attributePresets] =
    await Promise.all([
      supabaseAdmin
        .from("products")
        .select("*")
        .eq("id", id)
        .eq("store_id", store.id)
        .maybeSingle(),
      supabaseAdmin
        .from("categories")
        .select("*")
        .eq("store_id", store.id)
        .order("name"),
      supabaseAdmin.from("brands").select("*").eq("store_id", store.id).order("name"),
      supabaseAdmin.from("collections").select("*").eq("store_id", store.id).order("name"),
      supabaseAdmin.from("product_families").select("*").eq("store_id", store.id).order("name"),
      getAttributeDefs(store.id),
      getAttributePresets(store.id),
    ]);

  if (!product) notFound();

  return (
    <ProductForm
      action={updateProduct.bind(null, id)}
      product={product as Product}
      categories={(categories ?? []) as Category[]}
      brands={(brands ?? []) as Brand[]}
      collections={(collections ?? []) as Collection[]}
      families={(families ?? []) as ProductFamily[]}
      attributeDefs={attributeDefs}
      attributePresets={attributePresets}
      storeSourceLocale={store.google_content_language}
      enabledLocales={store.enabled_locales}
      contentLanguageOptions={configuredProductContentLocales(store)}
      defaultCurrency={getPrimaryStoreCurrency(store)}
      marketPricing={getStoreMarketPricing(store)}
      backHref={hasProductListContext ? productsHref : undefined}
      successHref={hasProductListContext ? productsHref : undefined}
    />
  );
}
