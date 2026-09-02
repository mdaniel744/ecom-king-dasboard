import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Product, ProductFamily } from "@/lib/types";
import { BulkSyncButton } from "@/app/dashboard/products/bulk-sync-button";
import { StoreReadinessBanner } from "@/app/dashboard/products/store-readiness-banner";
import { AddProductMenu } from "@/app/dashboard/products/add-product-menu";
import { ProductTransferMenu } from "@/app/dashboard/products/product-transfer-menu";
import { AllProductsTable, type CatalogEntry } from "@/app/dashboard/products/all-products-table";
import { checkStoreMerchantConfig } from "@/lib/merchant-rules";

export default async function ProductsPage() {
  const store = await getCurrentStore();
  const [{ data: products }, { data: families }] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("product_families")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: true }),
  ]);

  const productList = (products ?? []) as Product[];
  const familyList = (families ?? []) as ProductFamily[];
  const familyIds = new Set(familyList.map((family) => family.id));
  const variantsByFamily = new Map<string, Product[]>();

  for (const product of productList) {
    if (!product.family_id || !familyIds.has(product.family_id)) continue;
    const variants = variantsByFamily.get(product.family_id) ?? [];
    variants.push(product);
    variantsByFamily.set(product.family_id, variants);
  }

  const entries: CatalogEntry[] = [
    ...familyList.map((family): CatalogEntry => {
      const variants = variantsByFamily.get(family.id) ?? [];
      const representative = variants[0] ?? null;
      return {
        kind: "family",
        family,
        representative,
        variants,
        createdAt: representative?.created_at ?? family.created_at,
      };
    }),
    ...productList
      .filter((product) => !product.family_id || !familyIds.has(product.family_id))
      .map((product): CatalogEntry => ({
        kind: "product",
        product,
        createdAt: product.created_at,
      })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const storeIssues = checkStoreMerchantConfig(store);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">All Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Standalone products appear individually. Each product family appears once, represented
            by its first generated variation.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BulkSyncButton disabled={storeIssues.length > 0} />
          <ProductTransferMenu />
          <AddProductMenu />
        </div>
      </div>

      <div className="mt-6">
        <StoreReadinessBanner issues={storeIssues} />
      </div>

      <AllProductsTable entries={entries} store={store} />
    </div>
  );
}
