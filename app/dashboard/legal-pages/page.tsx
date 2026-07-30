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
import { LegalPageDialog } from "@/app/dashboard/legal-pages/legal-page-dialog";
import { DeleteLegalPageButton } from "@/app/dashboard/legal-pages/delete-legal-page-button";
import type { LegalPage } from "@/lib/types";

export default async function LegalPagesPage() {
  const store = await getCurrentStore();
  const { data: pages } = await supabaseAdmin
    .from("legal_pages")
    .select("*")
    .eq("store_id", store.id)
    .order("title");

  const items = (pages ?? []) as LegalPage[];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Legal Pages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Impressum, privacy policy, terms, returns policy — shown on your storefront
          </p>
        </div>
        <div className="shrink-0">
          <LegalPageDialog storeSourceLocale={store.google_content_language} enabledLocales={store.enabled_locales} />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No legal pages yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((page) => (
              <TableRow key={page.id}>
                <TableCell className="font-medium">{page.title}</TableCell>
                <TableCell className="text-muted-foreground">/{page.slug}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <LegalPageDialog page={page} storeSourceLocale={store.google_content_language} enabledLocales={store.enabled_locales} />
                    <DeleteLegalPageButton pageId={page.id} />
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
