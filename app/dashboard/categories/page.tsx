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
import { CategoryDialog } from "@/app/dashboard/categories/category-dialog";
import { DeleteCategoryButton } from "@/app/dashboard/categories/delete-category-button";
import type { Category } from "@/lib/types";

export default async function CategoriesPage() {
  const store = await getCurrentStore();
  const { data } = await supabaseAdmin
    .from("categories")
    .select("*")
    .eq("store_id", store.id)
    .order("display_order")
    .order("name");

  const categories = (data ?? []) as Category[];
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize your products into categories
          </p>
        </div>
        <CategoryDialog categories={categories} storeSourceLocale={store.google_content_language} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No categories yet.
                </TableCell>
              </TableRow>
            )}
            {categories.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">{cat.name}</TableCell>
                <TableCell className="text-muted-foreground">{cat.slug}</TableCell>
                <TableCell className="text-muted-foreground">
                  {cat.parent_id ? nameById.get(cat.parent_id) ?? "—" : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {cat.is_featured ? "Yes" : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{cat.display_order}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <CategoryDialog categories={categories} category={cat} storeSourceLocale={store.google_content_language} />
                    <DeleteCategoryButton categoryId={cat.id} />
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
