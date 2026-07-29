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
import { BrandDialog } from "@/app/dashboard/brands/brand-dialog";
import { DeleteBrandButton } from "@/app/dashboard/brands/delete-brand-button";
import type { Brand } from "@/lib/types";

export default async function BrandsPage() {
  const store = await getCurrentStore();
  const { data: brands } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("store_id", store.id)
    .order("name");

  const items = (brands ?? []) as Brand[];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brands</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manufacturer or designer brands your products belong to
          </p>
        </div>
        <div className="shrink-0">
          <BrandDialog storeSourceLocale={store.google_content_language} enabledLocales={store.enabled_locales} />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No brands yet — only add these if your products are organized by manufacturer
                  brand (e.g. watches, apparel). Not every store needs this.
                </TableCell>
              </TableRow>
            )}
            {items.map((brand) => (
              <TableRow key={brand.id}>
                <TableCell className="font-medium">{brand.name}</TableCell>
                <TableCell className="text-muted-foreground">/{brand.slug}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <BrandDialog brand={brand} storeSourceLocale={store.google_content_language} enabledLocales={store.enabled_locales} />
                    <DeleteBrandButton brandId={brand.id} />
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
