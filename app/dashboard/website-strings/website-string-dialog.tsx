"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createWebsiteString, updateWebsiteString } from "@/app/dashboard/website-strings/actions";
import type { WebsiteString } from "@/lib/types";

export function WebsiteStringDialog({
  str,
  storeSourceLocale = "en",
  enabledLocales = [],
}: {
  str?: WebsiteString;
  storeSourceLocale?: string;
  enabledLocales?: string[];
}) {
  const isEdit = Boolean(str);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" title="Edit string">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New String
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit String" : "New String"}</DialogTitle>
        </DialogHeader>
        <ActionErrorBanner message={error} />
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = isEdit
                ? await updateWebsiteString(str!.id, formData)
                : await createWebsiteString(formData);
              if (result.success) {
                toast.success(isEdit ? "String updated" : "String created");
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
            <Label htmlFor="key">Key *</Label>
            <Input
              id="key"
              name="key"
              required
              defaultValue={str?.key ?? ""}
              placeholder="e.g. nav.shop"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="default_value">Default Value *</Label>
            <Input id="default_value" name="default_value" required defaultValue={str?.default_value ?? ""} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>

        {isEdit && (
          <TranslationEditor
            entityType="website_string"
            entityId={str?.id}
            enabledLocales={enabledLocales}
            fields={[{ name: "value", label: "Value" }]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
