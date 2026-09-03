import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ImageIcon, Plus, Wand2 } from "lucide-react";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAttributeDefs, getAttributePresets } from "@/lib/attribute-defs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FamilyDialog } from "@/app/dashboard/product-families/family-dialog";
import { FamilyVariantList } from "@/app/dashboard/product-families/[id]/family-variant-list";
import { ProductForm } from "@/app/dashboard/products/product-form";
import { updateProduct } from "@/app/dashboard/products/actions";
import { getPrimaryStoreCurrency, getStoreMarketPricing } from "@/lib/merchant-locales";
import type { Brand, Category, Collection, Product, ProductFamily } from "@/lib/types";

function formatPrice(product: Product) {
  if (product.price == null) return "Price not set";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: product.currency || "USD",
    }).format(product.price);
  } catch {
    return `${product.price} ${product.currency || "USD"}`;
  }
}

function missingDetails(product: Product) {
  const missing: string[] = [];
  if (product.price == null || product.price <= 0) missing.push("price");
  if (!product.images?.length) missing.push("images");
  if (!product.description?.trim()) missing.push("description");
  if (!product.sku?.trim()) missing.push("SKU");
  return missing;
}

export default async function ProductFamilyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editVariant?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const editVariantId = typeof query.editVariant === "string" ? query.editVariant : null;
  const store = await getCurrentStore();
  const [
    { data: family },
    { data: products },
    { data: categories },
    { data: brands },
    { data: collections },
    { data: families },
    attributeDefs,
    attributePresets,
  ] = await Promise.all([
    supabaseAdmin
      .from("product_families")
      .select("*")
      .eq("id", id)
      .eq("store_id", store.id)
      .maybeSingle(),
    supabaseAdmin
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .eq("family_id", id)
      .order("created_at", { ascending: true }),
    supabaseAdmin.from("categories").select("*").eq("store_id", store.id).order("name"),
    supabaseAdmin.from("brands").select("*").eq("store_id", store.id).order("name"),
    supabaseAdmin.from("collections").select("*").eq("store_id", store.id).order("name"),
    supabaseAdmin.from("product_families").select("*").eq("store_id", store.id).order("name"),
    getAttributeDefs(store.id),
    getAttributePresets(store.id),
  ]);

  if (!family) notFound();

  const typedFamily = family as ProductFamily;
  const productList = (products ?? []) as Product[];
  const categoryList = (categories ?? []) as Category[];
  const representativeProduct = productList[0] ?? null;
  const selectedProduct = editVariantId
    ? productList.find((product) => product.id === editVariantId) ?? null
    : null;
  const representativeCategoryId = representativeProduct?.category_id ?? typedFamily.category_id;
  const categoryName = representativeCategoryId
    ? categoryList.find((category) => category.id === representativeCategoryId)?.name
    : null;
  const familyHref = `/dashboard/product-families/${typedFamily.id}`;

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href="/dashboard/product-families" aria-label="Back to product families">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
              {representativeProduct?.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={representativeProduct.images[0]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">
                {representativeProduct?.name || typedFamily.name}
              </h1>
              <Badge>Product family</Badge>
              <Badge variant="secondary">
                {productList.length} variation{productList.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {representativeProduct?.short_description || typedFamily.short_description ||
                "Every item below is an independent product displayed as a selectable variation on one product page."}
            </p>
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              Family: {typedFamily.name} · represented by the first generated variation
            </p>
            {categoryName && (
              <p className="mt-2 text-xs text-muted-foreground">Category: {categoryName}</p>
            )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pl-12 lg:pl-0">
          <FamilyDialog
            categories={categoryList}
            family={typedFamily}
            storeSourceLocale={store.google_content_language}
          />
          <Button asChild variant="outline">
            <Link href={`/dashboard/product-families/${typedFamily.id}/generate`}>
              <Wand2 className="mr-2 h-4 w-4" />
              Generate More Variations
            </Link>
          </Button>
        </div>
      </div>

      {representativeProduct && (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Family listing information</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              All Products uses the first generated variation as this family&apos;s representative item.
            </p>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Representative variation</dt>
                <dd className="mt-1 font-medium">{representativeProduct.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Price</dt>
                <dd className="mt-1 font-medium">{formatPrice(representativeProduct)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Stock</dt>
                <dd className="mt-1 font-medium">{representativeProduct.stock_quantity ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">SKU</dt>
                <dd className="mt-1 font-medium">{representativeProduct.sku || "Not set"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {selectedProduct && (
        <section id="variant-editor" className="mt-6 scroll-mt-6 rounded-xl border border-primary/30 bg-card p-4 shadow-sm sm:p-6">
          <ProductForm
            action={updateProduct.bind(null, selectedProduct.id)}
            product={selectedProduct}
            categories={categoryList}
            brands={(brands ?? []) as Brand[]}
            collections={(collections ?? []) as Collection[]}
            families={(families ?? []) as ProductFamily[]}
            attributeDefs={attributeDefs}
            attributePresets={attributePresets}
            storeSourceLocale={store.google_content_language}
            enabledLocales={store.enabled_locales}
            defaultCurrency={getPrimaryStoreCurrency(store)}
            marketPricing={getStoreMarketPricing(store)}
            backHref={familyHref}
            successHref={familyHref}
            heading={`Edit variation · ${selectedProduct.name}`}
          />
        </section>
      )}

      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Product Variations</h2>
          <p className="text-sm text-muted-foreground">
            Open each product to complete its normal product details. Drafts remain hidden from shoppers.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          {productList.filter((product) => missingDetails(product).length === 0).length} of {productList.length} complete
        </Badge>
      </div>

      {productList.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed bg-card p-10 text-center">
          <h3 className="font-medium">No product variations yet</h3>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            Select the product attributes that vary, then generate every possible combination as an independent draft product.
          </p>
          <Button asChild className="mt-4">
            <Link href={`/dashboard/product-families/${typedFamily.id}/generate`}>
              <Plus className="mr-2 h-4 w-4" />
              Generate Product Variations
            </Link>
          </Button>
        </div>
      ) : (
        <FamilyVariantList familyId={typedFamily.id} products={productList} />
      )}
    </div>
  );
}
