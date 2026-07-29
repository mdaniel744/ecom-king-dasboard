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
import { FaqDialog } from "@/app/dashboard/faqs/faq-dialog";
import { DeleteFaqButton } from "@/app/dashboard/faqs/delete-faq-button";
import type { Faq } from "@/lib/types";

export default async function FaqsPage() {
  const store = await getCurrentStore();
  const { data: faqs } = await supabaseAdmin
    .from("faqs")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  const items = (faqs ?? []) as Faq[];
  const categoryOptions = Array.from(
    new Set(items.map((f) => f.category).filter((c): c is string => Boolean(c)))
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">FAQ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Frequently asked questions shown on your storefront
          </p>
        </div>
        <div className="shrink-0">
          <FaqDialog
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
              <TableHead>Question</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No FAQs yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((faq) => (
              <TableRow key={faq.id}>
                <TableCell className="font-medium">{faq.question}</TableCell>
                <TableCell className="text-muted-foreground">{faq.category ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <FaqDialog
                      faq={faq}
                      categoryOptions={categoryOptions}
                      storeSourceLocale={store.google_content_language}
                      enabledLocales={store.enabled_locales}
                    />
                    <DeleteFaqButton faqId={faq.id} />
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
