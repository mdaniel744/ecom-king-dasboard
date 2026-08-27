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
import { FamilyDialog } from "@/app/dashboard/product-families/family-dialog";
import { DeleteFamilyButton } from "@/app/dashboard/product-families/delete-family-button";
import type { Category, ProductFamily } from "@/lib/types";

export default async function ProductFamiliesPage() {
  const store = await getCurrentStore();
  const [{ data: families }, { data: categories }, { data: productCounts }] = await Promise.all([
    supabaseAdmin
      .from("product_families")
      .select("*")
      .eq("store_id", store.id)
      .order("name"),
    supabaseAdmin.from("categories").select("*").eq("store_id", store.id).order("name"),
    supabaseAdmin.from("products").select("family_id").eq("store_id", store.id).not("family_id", "is", null),
  ]);

  const familyList = (families ?? []) as ProductFamily[];
  const categoryList = (categories ?? []) as Category[];
  const categoryNameById = new Map(categoryList.map((c) => [c.id, c.name]));

  const variantCountByFamily = new Map<string, number>();
  for (const row of productCounts ?? []) {
    const id = row.family_id as string;
    variantCountByFamily.set(id, (variantCountByFamily.get(id) ?? 0) + 1);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Product Families</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Group related products (e.g. different sizes/colours of the same container) so
            shoppers can switch between them on one product's page. Assign a product to a family
            from the product's own edit page — creating a family here doesn't move any products
            into it by itself.
          </p>
        </div>
        <div className="shrink-0">
          <FamilyDialog categories={categoryList} storeSourceLocale={store.google_content_language} />
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
                  No product families yet — most products don&apos;t need one. Only create a
                  family when you have several separate products that are really the same item
                  in different sizes/colours/conditions.
                </TableCell>
              </TableRow>
            )}
            {familyList.map((family) => (
              <TableRow key={family.id}>
                <TableCell className="font-medium">{family.name}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {family.category_id ? categoryNameById.get(family.category_id) ?? "—" : "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {variantCountByFamily.get(family.id) ?? 0}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {family.is_featured ? "Yes" : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <FamilyDialog
                      categories={categoryList}
                      family={family}
                      storeSourceLocale={store.google_content_language}
                    />
                    <DeleteFamilyButton familyId={family.id} />
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
