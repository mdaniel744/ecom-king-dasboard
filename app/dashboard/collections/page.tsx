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
import { CollectionDialog } from "@/app/dashboard/collections/collection-dialog";
import { DeleteCollectionButton } from "@/app/dashboard/collections/delete-collection-button";
import type { Brand, Collection } from "@/lib/types";

export default async function CollectionsPage() {
  const store = await getCurrentStore();
  const [{ data: collections }, { data: brands }] = await Promise.all([
    supabaseAdmin.from("collections").select("*").eq("store_id", store.id).order("name"),
    supabaseAdmin.from("brands").select("*").eq("store_id", store.id).order("name"),
  ]);

  const items = (collections ?? []) as Collection[];
  const brandList = (brands ?? []) as Brand[];
  const brandMap = new Map(brandList.map((b) => [b.id, b.name]));

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Product lines within a brand — e.g. &quot;Laureato&quot; within Girard-Perregaux
          </p>
        </div>
        <div className="shrink-0">
          {brandList.length > 0 ? (
            <CollectionDialog brands={brandList} storeSourceLocale={store.google_content_language} enabledLocales={store.enabled_locales} />
          ) : null}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brandList.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  Create a Brand first — every collection belongs to exactly one brand.
                </TableCell>
              </TableRow>
            )}
            {brandList.length > 0 && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No collections yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((collection) => (
              <TableRow key={collection.id}>
                <TableCell className="font-medium">{collection.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {brandMap.get(collection.brand_id) ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <CollectionDialog
                      collection={collection}
                      brands={brandList}
                      storeSourceLocale={store.google_content_language}
                      enabledLocales={store.enabled_locales}
                    />
                    <DeleteCollectionButton collectionId={collection.id} />
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
