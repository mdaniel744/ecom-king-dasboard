import { notFound } from "next/navigation";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAttributeDefs } from "@/lib/attribute-defs";
import { ProductForm } from "@/app/dashboard/products/product-form";
import { updateProduct } from "@/app/dashboard/products/actions";
import type { Brand, Category, Collection, Product } from "@/lib/types";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = await getCurrentStore();

  const [{ data: product }, { data: categories }, { data: brands }, { data: collections }, attributeDefs] = await Promise.all([
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
    getAttributeDefs(store.id),
  ]);

  if (!product) notFound();

  return (
    <ProductForm
      action={updateProduct.bind(null, id)}
      product={product as Product}
      categories={(categories ?? []) as Category[]}
      brands={(brands ?? []) as Brand[]}
      collections={(collections ?? []) as Collection[]}
      attributeDefs={attributeDefs}
      storeSourceLocale={store.google_content_language}
      enabledLocales={store.enabled_locales}
    />
  );
}
