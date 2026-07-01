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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionErrorBanner } from "@/components/dashboard/action-error-banner";
import { AIWriteButton } from "@/components/dashboard/ai-write-button";
import { createCategory, updateCategory } from "@/app/dashboard/categories/actions";
import type { Category } from "@/lib/types";

export function CategoryDialog({
  categories,
  category,
  storeSourceLocale = "en",
}: {
  categories: Category[];
  category?: Category;
  storeSourceLocale?: string;
}) {
  const isEdit = !!category;
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [catName, setCatName] = useState(category?.name ?? "");
  const [catDesc, setCatDesc] = useState(category?.description ?? "");
  const [metaTitle, setMetaTitle] = useState(category?.meta_title ?? "");
  const [metaDesc, setMetaDesc] = useState(category?.meta_description ?? "");

  const parentOptions = categories.filter((cat) => cat.id !== category?.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" aria-label="Edit category">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Category
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Category" : "New Category"}</DialogTitle>
        </DialogHeader>
        <ActionErrorBanner message={error} />
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = isEdit
                ? await updateCategory(category!.id, formData)
                : await createCategory(formData);
              if (result.success) {
                toast.success(isEdit ? "Category updated" : "Category created");
                if (!isEdit) formRef.current?.reset();
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
            <div className="flex items-center justify-between">
              <Label htmlFor="name">Name *</Label>
              <AIWriteButton getValue={() => catName} onResult={setCatName} fieldRole="name" defaultLocale={storeSourceLocale} />
            </div>
            <Input
              id="name"
              name="name"
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g. Containers"
            />
          </div>

          {parentOptions.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="parent_id">Parent Category</Label>
              <Select name="parent_id" defaultValue={category?.parent_id ?? ""}>
                <SelectTrigger id="parent_id">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {parentOptions.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              This will be your first category — you can nest future ones
              under it once it exists.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="image_url">Image URL</Label>
            <Input
              id="image_url"
              name="image_url"
              defaultValue={category?.image_url ?? ""}
              placeholder="https://... (shown on the storefront category card)"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Description</Label>
              <AIWriteButton getValue={() => catDesc} onResult={setCatDesc} fieldRole="category_description" defaultLocale={storeSourceLocale} />
            </div>
            <Textarea
              id="description"
              name="description"
              rows={3}
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              placeholder="Short description shown on the storefront card"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="is_featured"
                name="is_featured"
                defaultChecked={category?.is_featured ?? false}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor="is_featured" className="cursor-pointer">
                Show on homepage
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display_order">Display Order</Label>
              <Input
                id="display_order"
                name="display_order"
                type="number"
                defaultValue={category?.display_order ?? 0}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="meta_title">SEO Title</Label>
              <AIWriteButton getValue={() => metaTitle} onResult={setMetaTitle} fieldRole="meta_title" defaultLocale={storeSourceLocale} />
            </div>
            <Input
              id="meta_title"
              name="meta_title"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Defaults to the category name if left blank"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="meta_description">SEO Description</Label>
              <AIWriteButton getValue={() => metaDesc} onResult={setMetaDesc} fieldRole="meta_description" defaultLocale={storeSourceLocale} />
            </div>
            <Textarea
              id="meta_description"
              name="meta_description"
              rows={2}
              value={metaDesc}
              onChange={(e) => setMetaDesc(e.target.value)}
              placeholder="Shown in search engine results for this category's page"
            />
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
