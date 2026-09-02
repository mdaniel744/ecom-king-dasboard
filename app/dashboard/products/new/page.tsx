import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAttributeDefs } from "@/lib/attribute-defs";
import { ProductForm } from "@/app/dashboard/products/product-form";
import { createProduct } from "@/app/dashboard/products/actions";
import { getPrimaryStoreCurrency, getStoreMarketPricing } from "@/lib/merchant-locales";
import type { Brand, Category, Collection, ProductFamily } from "@/lib/types";

export default async function NewProductPage() {
  const store = await getCurrentStore();
  const [{ data: categories }, { data: brands }, { data: collections }, { data: families }, attributeDefs] =
    await Promise.all([
      supabaseAdmin.from("categories").select("*").eq("store_id", store.id).order("name"),
      supabaseAdmin.from("brands").select("*").eq("store_id", store.id).order("name"),
      supabaseAdmin.from("collections").select("*").eq("store_id", store.id).order("name"),
      supabaseAdmin.from("product_families").select("*").eq("store_id", store.id).order("name"),
      getAttributeDefs(store.id),
    ]);

  return (
    <ProductForm
      action={createProduct}
      categories={(categories ?? []) as Category[]}
      brands={(brands ?? []) as Brand[]}
      collections={(collections ?? []) as Collection[]}
      families={(families ?? []) as ProductFamily[]}
      attributeDefs={attributeDefs}
      storeSourceLocale={store.google_content_language}
      enabledLocales={store.enabled_locales}
      defaultCurrency={getPrimaryStoreCurrency(store)}
      marketPricing={getStoreMarketPricing(store)}
    />
  );
}
