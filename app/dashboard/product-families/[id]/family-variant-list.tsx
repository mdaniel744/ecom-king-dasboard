"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, FilePenLine, ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { manageFamilyVariants } from "@/app/dashboard/product-families/actions";
import { FamilyVariantActions } from "@/app/dashboard/product-families/[id]/family-variant-actions";
import type { Product } from "@/lib/types";

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

export function FamilyVariantList({
  familyId,
  products,
}: {
  familyId: string;
  products: Product[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const productIds = useMemo(() => products.map((product) => product.id), [products]);
  const allSelected = productIds.length > 0 && productIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    const available = new Set(productIds);
    setSelectedIds((current) => new Set([...current].filter((id) => available.has(id))));
  }, [productIds]);

  function toggleProduct(productId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  function runBulkAction(operation: "draft" | "delete") {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      operation === "delete" &&
      !window.confirm(
        `Permanently delete ${ids.length} selected product variation${ids.length === 1 ? "" : "s"}? This removes them from the database and cannot be undone.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await manageFamilyVariants({ familyId, productIds: ids, operation });
      if (!result.success) {
        toast.error(result.error ?? "The selected products could not be updated.");
        return;
      }

      const affected = result.data.affected;
      toast.success(
        operation === "draft"
          ? `${affected} product variation${affected === 1 ? "" : "s"} moved to Draft.`
          : `${affected} product variation${affected === 1 ? "" : "s"} permanently deleted.`
      );
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) =>
              setSelectedIds(event.target.checked ? new Set(productIds) : new Set())
            }
            className="h-4 w-4 rounded border-border accent-primary"
            aria-label="Select all product variations"
          />
          Select all
        </label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={selectedIds.size === 0 || isPending}>
              {isPending ? "Updating…" : "Manage"}
              <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>
              {selectedIds.size} selected product{selectedIds.size === 1 ? "" : "s"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onSelect={() => runBulkAction("draft")}>
              <FilePenLine />
              Move to Draft
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={() => runBulkAction("delete")}
            >
              <Trash2 />
              Delete permanently
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-xs text-muted-foreground">
          {selectedIds.size === 0
            ? "Select products to manage them together"
            : `${selectedIds.size} selected`}
        </span>
      </div>

      {products.map((product) => {
        const missing = missingDetails(product);
        const selected = selectedIds.has(product.id);
        return (
          <div
            key={product.id}
            className={`flex flex-col gap-4 border-b p-4 last:border-b-0 lg:flex-row lg:items-center ${
              selected ? "bg-primary/[0.04]" : ""
            }`}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) => toggleProduct(product.id, event.target.checked)}
                className="mt-6 h-4 w-4 shrink-0 rounded border-border accent-primary"
                aria-label={`Select ${product.name}`}
              />
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
                {product.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.images[0]}
                    alt={product.image_alts?.[0] || ""}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold leading-snug">{product.name}</h3>
                  <Badge variant={product.status === "active" ? "default" : "secondary"}>
                    {product.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {product.sku ? `SKU: ${product.sku}` : "SKU not set"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(product.attributes ?? {}).map(([attribute, value]) => (
                    <Badge key={attribute} variant="outline" className="font-normal">
                      {attribute}: {value}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 text-sm lg:min-w-[260px]">
              <div>
                <dt className="text-xs text-muted-foreground">Price</dt>
                <dd className="font-medium">{formatPrice(product)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Stock</dt>
                <dd className="font-medium">{product.stock_quantity ?? 0}</dd>
              </div>
              <div className="col-span-2 text-xs">
                {missing.length === 0 ? (
                  <p className="font-medium text-emerald-700">Core product details complete</p>
                ) : (
                  <p className="text-amber-700">
                    <span className="font-medium">Needs product details:</span> {missing.join(", ")}
                  </p>
                )}
              </div>
            </dl>

            <FamilyVariantActions
              productId={product.id}
              productName={product.name}
              currentFamilyId={familyId}
            />
          </div>
        );
      })}
    </div>
  );
}
