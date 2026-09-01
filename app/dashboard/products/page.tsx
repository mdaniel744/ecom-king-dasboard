import Link from "next/link";
import { Eye, ImageIcon, Layers3, Pencil } from "lucide-react";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Product, ProductFamily } from "@/lib/types";
import { DeleteProductButton } from "@/app/dashboard/products/delete-product-button";
import { SyncGoogleButton } from "@/app/dashboard/products/sync-google-button";
import { BulkSyncButton } from "@/app/dashboard/products/bulk-sync-button";
import { ReadinessBadge } from "@/app/dashboard/products/readiness-badge";
import { GoogleStatusBadge } from "@/app/dashboard/products/google-status-badge";
import { StoreReadinessBanner } from "@/app/dashboard/products/store-readiness-banner";
import { AddProductMenu } from "@/app/dashboard/products/add-product-menu";
import { checkProductForMerchant, checkStoreMerchantConfig } from "@/lib/merchant-rules";

type CatalogEntry =
  | {
      kind: "family";
      family: ProductFamily;
      representative: Product | null;
      variants: Product[];
      createdAt: string;
    }
  | {
      kind: "product";
      product: Product;
      createdAt: string;
    };

function formatPrice(product: Product | null) {
  if (!product || product.price == null) return "—";

  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: product.currency || "USD",
    }).format(product.price);
  } catch {
    return `${product.currency || "USD"} ${product.price}`;
  }
}

function familyGoogleStatus(variants: Product[]): Product["google_sync_status"] {
  if (variants.some((product) => product.google_sync_status === "error")) return "error";
  if (variants.length > 0 && variants.every((product) => product.google_sync_status === "synced")) {
    return "synced";
  }
  if (variants.some((product) => product.google_sync_status === "pending")) return "pending";
  return "not_synced";
}

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
          <AddProductMenu />
        </div>
      </div>

      <div className="mt-6">
        <StoreReadinessBanner issues={storeIssues} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="hidden sm:table-cell">Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Google</TableHead>
              <TableHead className="hidden md:table-cell">Merchant Readiness</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No products yet — create your first one.
                </TableCell>
              </TableRow>
            )}

            {entries.map((entry) => {
              if (entry.kind === "family") {
                const { family, representative, variants } = entry;
                const googleStatus = familyGoogleStatus(variants);
                const googleError =
                  variants.find((product) => product.google_sync_status === "error")
                    ?.google_sync_error ?? null;

                return (
                  <TableRow key={`family-${family.id}`} className="bg-primary/[0.025]">
                    <TableCell className="font-medium">
                      <div className="flex min-w-[250px] items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                          {representative?.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={representative.images[0]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/dashboard/product-families/${family.id}`}
                              className="line-clamp-1 hover:text-primary hover:underline"
                            >
                              {representative?.name || family.name}
                            </Link>
                            <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                              <Layers3 className="h-3 w-3" />
                              Product family
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs font-normal text-muted-foreground">
                            {family.name} · {variants.length} variation
                            {variants.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{formatPrice(representative)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {representative?.stock_quantity ?? "—"}
                    </TableCell>
                    <TableCell>
                      {representative ? (
                        <Badge variant={representative.status === "active" ? "default" : "secondary"}>
                          {representative.status}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">empty family</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <GoogleStatusBadge status={googleStatus} error={googleError} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {representative ? (
                        <ReadinessBadge issues={checkProductForMerchant(representative, store)} />
                      ) : (
                        <Badge variant="outline">Add variations</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/product-families/${family.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          View {variants.length} variation{variants.length === 1 ? "" : "s"}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              }

              const product = entry.product;
              return (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">
                    <div className="flex min-w-[250px] items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                        {product.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.images[0]}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="line-clamp-1">{product.name}</p>
                        <p className="mt-1 text-xs font-normal text-muted-foreground">
                          Standalone product
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{formatPrice(product)}</TableCell>
                  <TableCell className="hidden sm:table-cell">{product.stock_quantity}</TableCell>
                  <TableCell>
                    <Badge variant={product.status === "active" ? "default" : "secondary"}>
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <GoogleStatusBadge
                      status={product.google_sync_status}
                      error={product.google_sync_error}
                    />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <ReadinessBadge issues={checkProductForMerchant(product, store)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="ghost" size="icon">
                        <Link
                          href={`/dashboard/products/${product.id}/edit`}
                          aria-label={`Edit ${product.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <SyncGoogleButton productId={product.id} />
                      <DeleteProductButton productId={product.id} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
