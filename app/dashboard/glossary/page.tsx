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
import { GlossaryDialog } from "@/app/dashboard/glossary/glossary-dialog";
import { DeleteGlossaryTermButton } from "@/app/dashboard/glossary/delete-glossary-term-button";
import type { GlossaryTerm } from "@/lib/types";

const RULE_LABELS: Record<string, string> = {
  preserve: "Preserve Original",
  always_translate: "Always Translate",
  never_translate: "Never Translate",
};

export default async function GlossaryPage() {
  const store = await getCurrentStore();
  const { data: terms } = await supabaseAdmin
    .from("glossary")
    .select("*")
    .eq("store_id", store.id)
    .order("original_term");

  const items = (terms ?? []) as GlossaryTerm[];
  const locales = Array.from(new Set([store.google_content_language, ...(store.enabled_locales ?? [])]));

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Glossary</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define brand or product terms that should stay consistent across AI translations —
            e.g. a model name that should never be translated.
          </p>
        </div>
        <div className="shrink-0">
          <GlossaryDialog locales={locales} />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Original Term</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No glossary terms yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((term) => (
              <TableRow key={term.id}>
                <TableCell className="font-medium">{term.original_term}</TableCell>
                <TableCell className="text-muted-foreground">{RULE_LABELS[term.rule_type]}</TableCell>
                <TableCell>
                  <Badge variant={term.active ? "default" : "secondary"}>
                    {term.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <GlossaryDialog term={term} locales={locales} />
                    <DeleteGlossaryTermButton termId={term.id} />
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
