import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Eye, ImageIcon, Plus, Wand2 } from "lucide-react";
import Link from "next/link";
import { FamilyDialog } from "@/app/dashboard/product-families/family-dialog";
import { DeleteFamilyButton } from "@/app/dashboard/product-families/delete-family-button";
import type { Category, Product, ProductFamily } from "@/lib/types";

export default async function ProductFamiliesPage() {
  const store = await getCurrentStore();
  const [{ data: families }, { data: categories }, { data: productCounts }] = await Promise.all([
    supabaseAdmin
      .from("product_families")
      .select("*")
      .eq("store_id", store.id)
      .order("name"),
    supabaseAdmin.from("categories").select("*").eq("store_id", store.id).order("name"),
    supabaseAdmin
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .not("family_id", "is", null)
      .order("created_at", { ascending: true }),
  ]);

  const familyList = (families ?? []) as ProductFamily[];
  const categoryList = (categories ?? []) as Category[];
  const categoryNameById = new Map(categoryList.map((c) => [c.id, c.name]));

  const variantCountByFamily = new Map<string, number>();
  const representativeByFamily = new Map<string, Product>();
  for (const row of (productCounts ?? []) as Product[]) {
    const id = row.family_id as string;
    variantCountByFamily.set(id, (variantCountByFamily.get(id) ?? 0) + 1);
    if (!representativeByFamily.has(id)) representativeByFamily.set(id, row);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Product Families</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Group related products on one product page so shoppers can switch between variations.
            Each variation remains an independent product with its own price, stock, SKU, images,
            description, and status.
          </p>
        </div>
        <div className="shrink-0">
          <Button asChild>
            <Link href="/dashboard/product-families/new">
              <Plus className="mr-2 h-4 w-4" />
              New Product Family
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead className="hidden sm:table-cell">Variants</TableHead>
              <TableHead className="hidden md:table-cell">Featured</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {familyList.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No product families yet. Create one, choose the attributes that vary, and the
                  dashboard will generate every selected combination as an editable draft product.
                </TableCell>
              </TableRow>
            )}
            {familyList.map((family) => {
              const representative = representativeByFamily.get(family.id);
              const displayCategoryId = representative?.category_id ?? family.category_id;
              return (
              <TableRow key={family.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                      {representative?.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={representative.images[0]} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/product-families/${family.id}`}
                        className="line-clamp-1 hover:text-primary hover:underline"
                      >
                        {representative?.name || family.name}
                      </Link>
                      <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                        Family: {family.name}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {displayCategoryId ? categoryNameById.get(displayCategoryId) ?? "—" : "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {variantCountByFamily.get(family.id) ?? 0}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {family.is_featured ? "Yes" : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="icon" title="View Product Variations">
                      <Link href={`/dashboard/product-families/${family.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="icon" title="Generate Variants">
                      <Link href={`/dashboard/product-families/${family.id}/generate`}>
                        <Wand2 className="h-4 w-4" />
                      </Link>
                    </Button>
                    <FamilyDialog
                      categories={categoryList}
                      family={family}
                      storeSourceLocale={store.google_content_language}
                    />
                    <DeleteFamilyButton familyId={family.id} />
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
