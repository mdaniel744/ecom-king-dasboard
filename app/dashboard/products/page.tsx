import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Product } from "@/lib/types";
import { DeleteProductButton } from "@/app/dashboard/products/delete-product-button";
import { SyncGoogleButton } from "@/app/dashboard/products/sync-google-button";
import { BulkSyncButton } from "@/app/dashboard/products/bulk-sync-button";
import { ReadinessBadge } from "@/app/dashboard/products/readiness-badge";
import { GoogleStatusBadge } from "@/app/dashboard/products/google-status-badge";
import { StoreReadinessBanner } from "@/app/dashboard/products/store-readiness-banner";
import { checkProductForMerchant, checkStoreMerchantConfig } from "@/lib/merchant-rules";

export default async function ProductsPage() {
  const store = await getCurrentStore();
  const { data: products } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  const items = (products ?? []) as Product[];
  const storeIssues = checkStoreMerchantConfig(store);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your store&apos;s products
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BulkSyncButton disabled={storeIssues.length > 0} />
          <Button asChild>
            <Link href="/dashboard/products/new">
              <Plus className="mr-2 h-4 w-4" />
              New Product
            </Link>
          </Button>
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
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No products yet — create your first one.
                </TableCell>
              </TableRow>
            )}
            {items.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>
                  {product.price != null ? `${product.currency} ${product.price}` : "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell">{product.stock_quantity}</TableCell>
                <TableCell>
                  <Badge variant={product.status === "active" ? "default" : "secondary"}>
                    {product.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <GoogleStatusBadge status={product.google_sync_status} error={product.google_sync_error} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <ReadinessBadge issues={checkProductForMerchant(product, store)} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="ghost" size="icon">
                      <Link href={`/dashboard/products/${product.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <SyncGoogleButton productId={product.id} />
                    <DeleteProductButton productId={product.id} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
