"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { createGuide, updateGuide } from "@/app/dashboard/guides/actions";
import type { Guide } from "@/lib/types";

export function GuideDialog({
  guide,
  categoryOptions,
  storeSourceLocale = "en",
  enabledLocales = [],
}: {
  guide?: Guide;
  categoryOptions: string[];
  storeSourceLocale?: string;
  enabledLocales?: string[];
}) {
  const isEdit = Boolean(guide);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(guide?.category ?? "");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" title="Edit guide">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Guide
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Guide" : "New Guide"}</DialogTitle>
        </DialogHeader>
        <ActionErrorBanner message={error} />
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = isEdit
                ? await updateGuide(guide!.id, formData)
                : await createGuide(formData);
              if (result.success) {
                toast.success(isEdit ? "Guide updated" : "Guide created");
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
            <Label htmlFor="title">Title *</Label>
            <Input id="title" name="title" required defaultValue={guide?.title ?? ""} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <CreatableCombobox
                name="category"
                value={category}
                onChange={setCategory}
                options={categoryOptions}
                placeholder="e.g. Buying Guide"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="slug" name="slug" defaultValue={guide?.slug ?? ""} placeholder="auto-generated from title" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="excerpt">Excerpt</Label>
            <Textarea id="excerpt" name="excerpt" rows={2} defaultValue={guide?.excerpt ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content">Content (Markdown)</Label>
            <Textarea id="content" name="content" rows={8} defaultValue={guide?.content ?? ""} className="font-mono text-sm" />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="published"
              name="published"
              defaultChecked={guide?.published ?? false}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <Label htmlFor="published" className="cursor-pointer">
              Published
            </Label>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>

        {isEdit && (
          <TranslationEditor
            entityType="guide"
            entityId={guide?.id}
            enabledLocales={enabledLocales}
            fields={[
              { name: "title", label: "Title" },
              { name: "excerpt", label: "Excerpt", multiline: true },
              { name: "content", label: "Content", multiline: true },
            ]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
