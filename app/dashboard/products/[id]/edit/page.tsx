import { notFound } from "next/navigation";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAttributeDefs } from "@/lib/attribute-defs";
import { ProductForm } from "@/app/dashboard/products/product-form";
import { updateProduct } from "@/app/dashboard/products/actions";
import type { Category, Product } from "@/lib/types";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = await getCurrentStore();

  const [{ data: product }, { data: categories }, attributeDefs] = await Promise.all([
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
    getAttributeDefs(store.id),
  ]);

  if (!product) notFound();

  return (
    <ProductForm
      action={updateProduct.bind(null, id)}
      product={product as Product}
      categories={(categories ?? []) as Category[]}
      attributeDefs={attributeDefs}
      storeSourceLocale={store.google_content_language}
    />
  );
}
