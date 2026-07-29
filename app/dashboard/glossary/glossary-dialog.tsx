"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ActionErrorBanner } from "@/components/dashboard/action-error-banner";
import { FieldInfo } from "@/components/ui/field-info";
import { createGlossaryTerm, updateGlossaryTerm } from "@/app/dashboard/glossary/actions";
import type { GlossaryRuleType, GlossaryTerm } from "@/lib/types";

export function GlossaryDialog({
  term,
  locales,
}: {
  term?: GlossaryTerm;
  locales: string[];
}) {
  const isEdit = Boolean(term);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState<GlossaryRuleType>(term?.rule_type ?? "always_translate");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" title="Edit term">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Term
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Glossary Term" : "New Glossary Term"}</DialogTitle>
        </DialogHeader>
        <ActionErrorBanner message={error} />
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = isEdit
                ? await updateGlossaryTerm(term!.id, formData)
                : await createGlossaryTerm(formData);
              if (result.success) {
                toast.success(isEdit ? "Term updated" : "Term added");
                formRef.current?.reset();
                setOpen(false);
              } else {
                setError(result.error);
                toast.error(result.error);
              }
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="original_term">Original Term *</Label>
            <Input
              id="original_term"
              name="original_term"
              required
              defaultValue={term?.original_term ?? ""}
              placeholder="e.g. Royal Oak"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="rule_type">Rule Type</Label>
              <FieldInfo
                title="Rule Type"
                description={
                  '"Never Translate" — always output the original term exactly, in every language (use for proper nouns like model names).\n\n' +
                  '"Always Translate" / "Preserve Original" — use the specific text you provide below for each language, instead of letting AI choose freely. Leave a language blank to let AI translate normally for that one.'
                }
              />
            </div>
            <Select name="rule_type" value={ruleType} onValueChange={(v) => setRuleType(v as GlossaryRuleType)}>
              <SelectTrigger id="rule_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="preserve">Preserve Original</SelectItem>
                <SelectItem value="always_translate">Always Translate</SelectItem>
                <SelectItem value="never_translate">Never Translate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {ruleType !== "never_translate" && (
            <div className="space-y-3">
              <Label>Translation per language</Label>
              {locales.map((locale) => (
                <div key={locale} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-xs font-medium uppercase text-muted-foreground">
                    {locale}
                  </span>
                  <input type="hidden" name="translation_locale" value={locale} />
                  <Input
                    name="translation_value"
                    defaultValue={term?.translations?.[locale] ?? ""}
                    placeholder="Leave blank to let AI translate normally"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes / Context <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={term?.notes ?? ""} placeholder="Optional context for translators" />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              name="active"
              defaultChecked={term?.active ?? true}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <Label htmlFor="active" className="cursor-pointer">
              Active
            </Label>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
