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
import { TranslationEditor } from "@/components/dashboard/translation-editor";
import { createCollection, updateCollection } from "@/app/dashboard/collections/actions";
import type { Brand, Collection } from "@/lib/types";

export function CollectionDialog({
  collection,
  brands,
  storeSourceLocale = "en",
  enabledLocales = [],
}: {
  collection?: Collection;
  brands: Brand[];
  storeSourceLocale?: string;
  enabledLocales?: string[];
}) {
  const isEdit = Boolean(collection);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" title="Edit collection">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Collection
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Collection" : "New Collection"}</DialogTitle>
        </DialogHeader>
        <ActionErrorBanner message={error} />
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = isEdit
                ? await updateCollection(collection!.id, formData)
                : await createCollection(formData);
              if (result.success) {
                toast.success(isEdit ? "Collection updated" : "Collection created");
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
            <Label htmlFor="brand_id">Brand *</Label>
            <Select name="brand_id" defaultValue={collection?.brand_id ?? ""}>
              <SelectTrigger id="brand_id">
                <SelectValue placeholder="Select Brand" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Collection Name *</Label>
            <Input id="name" name="name" required defaultValue={collection?.name ?? ""} placeholder="e.g. Laureato" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug <span className="text-xs font-normal text-muted-foreground">(optional, auto-generated)</span></Label>
            <Input id="slug" name="slug" defaultValue={collection?.slug ?? ""} placeholder="auto-generated from name" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="description" name="description" rows={3} defaultValue={collection?.description ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="image_url">Collection Image <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="image_url" name="image_url" defaultValue={collection?.image_url ?? ""} placeholder="https://..." />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>

        {isEdit && (
          <TranslationEditor
            entityType="collection"
            entityId={collection?.id}
            enabledLocales={enabledLocales}
            fields={[
              { name: "name", label: "Collection Name" },
              { name: "description", label: "Description", multiline: true },
            ]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
