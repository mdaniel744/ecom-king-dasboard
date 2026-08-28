import { notFound } from "next/navigation";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAttributeDefs } from "@/lib/attribute-defs";
import { GenerateVariantsForm } from "@/app/dashboard/product-families/[id]/generate/generate-variants-form";
import type { ProductFamily } from "@/lib/types";

export default async function GenerateVariantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = await getCurrentStore();

  const [{ data: family }, attributeDefs] = await Promise.all([
    supabaseAdmin.from("product_families").select("*").eq("id", id).eq("store_id", store.id).maybeSingle(),
    getAttributeDefs(store.id),
  ]);

  if (!family) notFound();

  return <GenerateVariantsForm family={family as ProductFamily} attributeDefs={attributeDefs} />;
}
