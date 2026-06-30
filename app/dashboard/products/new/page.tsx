import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAttributeDefs } from "@/lib/attribute-defs";
import { ProductForm } from "@/app/dashboard/products/product-form";
import { createProduct } from "@/app/dashboard/products/actions";
import type { Category } from "@/lib/types";

export default async function NewProductPage() {
  const store = await getCurrentStore();
  const [{ data: categories }, attributeDefs] = await Promise.all([
    supabaseAdmin.from("categories").select("*").eq("store_id", store.id).order("name"),
    getAttributeDefs(store.id),
  ]);

  return (
    <ProductForm
      action={createProduct}
      categories={(categories ?? []) as Category[]}
      attributeDefs={attributeDefs}
    />
  );
}
