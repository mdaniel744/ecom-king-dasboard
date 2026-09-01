import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAttributeDefs } from "@/lib/attribute-defs";
import { NewProductFamilyForm } from "@/app/dashboard/product-families/new/new-product-family-form";
import type { Category } from "@/lib/types";

export default async function NewProductFamilyPage() {
  const store = await getCurrentStore();
  const [{ data: categories }, attributeDefs] = await Promise.all([
    supabaseAdmin.from("categories").select("*").eq("store_id", store.id).order("name"),
    getAttributeDefs(store.id),
  ]);

  return (
    <NewProductFamilyForm
      categories={(categories ?? []) as Category[]}
      attributeDefs={attributeDefs}
      storeSourceLocale={store.google_content_language}
    />
  );
}
