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
import { WebsiteStringDialog } from "@/app/dashboard/website-strings/website-string-dialog";
import { DeleteWebsiteStringButton } from "@/app/dashboard/website-strings/delete-website-string-button";
import type { WebsiteString } from "@/lib/types";

export default async function WebsiteStringsPage() {
  const store = await getCurrentStore();
  const { data: strings } = await supabaseAdmin
    .from("website_strings")
    .select("*")
    .eq("store_id", store.id)
    .order("key");

  const items = (strings ?? []) as WebsiteString[];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Strings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Site-wide UI text (buttons, nav labels) — not tied to any single product or page
          </p>
        </div>
        <div className="shrink-0">
          <WebsiteStringDialog storeSourceLocale={store.google_content_language} enabledLocales={store.enabled_locales} />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Default Value</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No strings yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((str) => (
              <TableRow key={str.id}>
                <TableCell className="font-mono text-sm">{str.key}</TableCell>
                <TableCell className="text-muted-foreground">{str.default_value}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <WebsiteStringDialog str={str} storeSourceLocale={store.google_content_language} enabledLocales={store.enabled_locales} />
                    <DeleteWebsiteStringButton stringId={str.id} />
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
