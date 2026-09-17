"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePenLine,
  ImageIcon,
  Layers3,
  Pencil,
  Trash2,
} from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteProductButton } from "@/app/dashboard/products/delete-product-button";
import { GoogleStatusBadge } from "@/app/dashboard/products/google-status-badge";
import { ReadinessBadge } from "@/app/dashboard/products/readiness-badge";
import { SyncGoogleButton } from "@/app/dashboard/products/sync-google-button";
import { manageCatalogProducts } from "@/app/dashboard/products/actions";
import { checkProductForMerchant } from "@/lib/merchant-rules";
import type { Product, ProductFamily, Store } from "@/lib/types";

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [50, 100, 250] as const;

export type CatalogEntry =
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

function entryKey(entry: CatalogEntry) {
  return entry.kind === "family" ? `family:${entry.family.id}` : `product:${entry.product.id}`;
}

function entryName(entry: CatalogEntry) {
  return entry.kind === "family"
    ? entry.representative?.name || entry.family.name
    : entry.product.name;
}

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

export function AllProductsTable({ entries, store }: { entries: CatalogEntry[]; store: Store }) {
  const router = useRouter();
  const tableTopRef = useRef<HTMLDivElement>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const entryKeys = useMemo(() => entries.map(entryKey), [entries]);
  const allSelected = entryKeys.length > 0 && entryKeys.every((key) => selectedKeys.has(key));
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const displayedPage = Math.min(currentPage, totalPages);
  const pageStart = (displayedPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, entries.length);
  const visibleEntries = useMemo(
    () => entries.slice(pageStart, pageEnd),
    [entries, pageEnd, pageStart]
  );

  useEffect(() => {
    const available = new Set(entryKeys);
    setSelectedKeys((current) => new Set([...current].filter((key) => available.has(key))));
  }, [entryKeys]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function goToPage(page: number) {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
    window.requestAnimationFrame(() => {
      tableTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function toggleEntry(key: string, checked: boolean) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function runBulkAction(operation: "draft" | "delete") {
    const selectedEntries = entries.filter((entry) => selectedKeys.has(entryKey(entry)));
    if (selectedEntries.length === 0) return;

    if (
      operation === "delete" &&
      !window.confirm(
        `Permanently delete ${selectedEntries.length} selected catalog item${selectedEntries.length === 1 ? "" : "s"}? Selected product families include every variation. This removes them from the database and cannot be undone.`
      )
    ) {
      return;
    }

    const productIds = selectedEntries.flatMap((entry) =>
      entry.kind === "product" ? [entry.product.id] : []
    );
    const familyIds = selectedEntries.flatMap((entry) =>
      entry.kind === "family" ? [entry.family.id] : []
    );

    startTransition(async () => {
      const result = await manageCatalogProducts({ productIds, familyIds, operation });
      if (!result.success) {
        toast.error(result.error ?? "The selected products could not be updated.");
        return;
      }

      const affected = result.data.affectedEntries;
      toast.success(
        operation === "draft"
          ? `${affected} catalog item${affected === 1 ? "" : "s"} moved to Draft.`
          : `${affected} catalog item${affected === 1 ? "" : "s"} permanently deleted.`
      );
      setSelectedKeys(new Set());
      router.refresh();
    });
  }

  return (
    <div ref={tableTopRef} className="scroll-mt-6 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) =>
              setSelectedKeys(event.target.checked ? new Set(entryKeys) : new Set())
            }
            className="h-4 w-4 rounded border-border accent-primary"
            aria-label="Select all products"
          />
          Select all
        </label>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedKeys.size === 0 || isPending}
            >
              {isPending ? "Updating…" : "Manage"}
              <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>
              {selectedKeys.size} selected item{selectedKeys.size === 1 ? "" : "s"}
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
          {selectedKeys.size === 0
            ? "Select products to manage them together"
            : `${selectedKeys.size} selected`}
        </span>

        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="whitespace-nowrap text-muted-foreground">Products per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[82px]" aria-label="Products per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Select</span>
              </TableHead>
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
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No products yet — create your first one.
                </TableCell>
              </TableRow>
            )}

            {visibleEntries.map((entry) => {
              const key = entryKey(entry);
              const selected = selectedKeys.has(key);

              if (entry.kind === "family") {
                const { family, representative, variants } = entry;
                const googleStatus = familyGoogleStatus(variants);
                const googleError =
                  variants.find((product) => product.google_sync_status === "error")
                    ?.google_sync_error ?? null;

                return (
                  <TableRow
                    key={key}
                    className={selected ? "bg-primary/[0.04]" : "bg-primary/[0.025]"}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => toggleEntry(key, event.target.checked)}
                        className="h-4 w-4 rounded border-border accent-primary"
                        aria-label={`Select ${entryName(entry)} product family`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex min-w-[250px] items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                          {representative?.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={representative.images[0]}
                              alt={representative.image_alts?.[0] || ""}
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
                <TableRow key={key} className={selected ? "bg-primary/[0.04]" : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => toggleEntry(key, event.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                      aria-label={`Select ${entryName(entry)}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex min-w-[250px] items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
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

      {entries.length > 0 && (
        <div className="flex flex-col gap-3 border-t bg-muted/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            Showing <span className="font-medium text-foreground">{pageStart + 1}</span>–
            <span className="font-medium text-foreground">{pageEnd}</span> of{" "}
            <span className="font-medium text-foreground">{entries.length}</span> products
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToPage(displayedPage - 1)}
              disabled={displayedPage === 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="min-w-24 text-center text-muted-foreground">
              Page <span className="font-medium text-foreground">{displayedPage}</span> of{" "}
              <span className="font-medium text-foreground">{totalPages}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToPage(displayedPage + 1)}
              disabled={displayedPage === totalPages}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
