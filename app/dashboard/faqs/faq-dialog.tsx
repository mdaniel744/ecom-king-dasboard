"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ActionErrorBanner } from "@/components/dashboard/action-error-banner";
import { TranslationEditor } from "@/components/dashboard/translation-editor";
import { createFaq, updateFaq } from "@/app/dashboard/faqs/actions";
import type { Faq } from "@/lib/types";

export function FaqDialog({
  faq,
  categoryOptions,
  storeSourceLocale = "en",
  enabledLocales = [],
}: {
  faq?: Faq;
  categoryOptions: string[];
  storeSourceLocale?: string;
  enabledLocales?: string[];
}) {
  const isEdit = Boolean(faq);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(faq?.category ?? "");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" title="Edit FAQ">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New FAQ
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit FAQ" : "New FAQ"}</DialogTitle>
        </DialogHeader>
        <ActionErrorBanner message={error} />
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = isEdit
                ? await updateFaq(faq!.id, formData)
                : await createFaq(formData);
              if (result.success) {
                toast.success(isEdit ? "FAQ updated" : "FAQ created");
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
            <Label htmlFor="question">Question *</Label>
            <Textarea id="question" name="question" rows={2} required defaultValue={faq?.question ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="answer">Answer *</Label>
            <Textarea id="answer" name="answer" rows={4} required defaultValue={faq?.answer ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <CreatableCombobox
              name="category"
              value={category}
              onChange={setCategory}
              options={categoryOptions}
              placeholder="e.g. General"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>

        {isEdit && (
          <TranslationEditor
            entityType="faq"
            entityId={faq?.id}
            enabledLocales={enabledLocales}
            fields={[
              { name: "question", label: "Question" },
              { name: "answer", label: "Answer", multiline: true },
            ]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
