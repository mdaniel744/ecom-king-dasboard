"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { createLegalPage, updateLegalPage } from "@/app/dashboard/legal-pages/actions";
import type { LegalPage } from "@/lib/types";

export function LegalPageDialog({
  page,
  storeSourceLocale = "en",
  enabledLocales = [],
}: {
  page?: LegalPage;
  storeSourceLocale?: string;
  enabledLocales?: string[];
}) {
  const isEdit = Boolean(page);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" title="Edit page">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Legal Page
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Legal Page" : "New Legal Page"}</DialogTitle>
        </DialogHeader>
        <ActionErrorBanner message={error} />
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = isEdit
                ? await updateLegalPage(page!.id, formData)
                : await createLegalPage(formData);
              if (result.success) {
                toast.success(isEdit ? "Page updated" : "Page created");
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
            <Input id="title" name="title" required defaultValue={page?.title ?? ""} placeholder="e.g. Impressum" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="slug" name="slug" defaultValue={page?.slug ?? ""} placeholder="auto-generated from title" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content">Content</Label>
            <Textarea id="content" name="content" rows={10} defaultValue={page?.content ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta_title">SEO Title <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="meta_title" name="meta_title" defaultValue={page?.meta_title ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta_description">SEO Description <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="meta_description" name="meta_description" rows={2} defaultValue={page?.meta_description ?? ""} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>

        {isEdit && (
          <TranslationEditor
            entityType="legal_page"
            entityId={page?.id}
            enabledLocales={enabledLocales}
            fields={[
              { name: "title", label: "Title" },
              { name: "content", label: "Content", multiline: true },
              { name: "meta_title", label: "SEO Title" },
              { name: "meta_description", label: "SEO Description", multiline: true },
            ]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
