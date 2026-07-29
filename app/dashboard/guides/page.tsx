import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GuideDialog } from "@/app/dashboard/guides/guide-dialog";
import { DeleteGuideButton } from "@/app/dashboard/guides/delete-guide-button";
import type { Guide } from "@/lib/types";

export default async function GuidesPage() {
  const store = await getCurrentStore();
  const { data: guides } = await supabaseAdmin
    .from("guides")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  const items = (guides ?? []) as Guide[];
  const categoryOptions = Array.from(
    new Set(items.map((g) => g.category).filter((c): c is string => Boolean(c)))
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Guides</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Educational articles shown on your storefront — buying guides, care guides, and more
          </p>
        </div>
        <div className="shrink-0">
          <GuideDialog
            categoryOptions={categoryOptions}
            storeSourceLocale={store.google_content_language}
            enabledLocales={store.enabled_locales}
          />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No guides yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((guide) => (
              <TableRow key={guide.id}>
                <TableCell className="font-medium">{guide.title}</TableCell>
                <TableCell className="text-muted-foreground">{guide.category ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={guide.published ? "default" : "secondary"}>
                    {guide.published ? "Published" : "Draft"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <GuideDialog
                      guide={guide}
                      categoryOptions={categoryOptions}
                      storeSourceLocale={store.google_content_language}
                      enabledLocales={store.enabled_locales}
                    />
                    <DeleteGuideButton guideId={guide.id} />
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
