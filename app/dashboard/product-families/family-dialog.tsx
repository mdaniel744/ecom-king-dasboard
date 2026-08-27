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
import { ImageUploadInput } from "@/components/dashboard/image-upload-input";
import { createProductFamily, updateProductFamily } from "@/app/dashboard/product-families/actions";
import type { Category, ProductFamily } from "@/lib/types";

export function FamilyDialog({
  categories,
  family,
  storeSourceLocale = "en",
}: {
  categories: Category[];
  family?: ProductFamily;
  storeSourceLocale?: string;
}) {
  const isEdit = !!family;
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState(family?.name ?? "");
  const [description, setDescription] = useState(family?.description ?? "");
  const [shortDescription, setShortDescription] = useState(family?.short_description ?? "");
  const [imageUrl, setImageUrl] = useState(family?.images?.[0] ?? "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" aria-label="Edit family">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Family
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Product Family" : "New Product Family"}</DialogTitle>
        </DialogHeader>
        <ActionErrorBanner message={error} />
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = isEdit
                ? await updateProductFamily(family!.id, formData)
                : await createProductFamily(formData);
              if (result.success) {
                toast.success(isEdit ? "Family updated" : "Family created");
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
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 20ft Standard Container"
            />
            <p className="text-xs text-muted-foreground">
              This is the shared name shoppers see, not any one variant&apos;s own title — e.g.
              &quot;20ft Standard Container&quot;, not &quot;20ft Standard Container, Used, Blue&quot;.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="category_id">Category</Label>
            <Select name="category_id" defaultValue={family?.category_id ?? ""}>
              <SelectTrigger id="category_id">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              Image{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (shared representative image — each variant keeps its own real images too)
              </span>
            </Label>
            <input type="hidden" name="image_url" value={imageUrl} />
            <ImageUploadInput value={imageUrl} onChange={setImageUrl} folder="product-families" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="short_description">Short Description</Label>
              <AIWriteButton
                getValue={() => shortDescription}
                onResult={setShortDescription}
                fieldRole="short_description"
                defaultLocale={storeSourceLocale}
              />
            </div>
            <Textarea
              id="short_description"
              name="short_description"
              rows={2}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="Brief summary shown wherever the family is listed"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Description</Label>
              <AIWriteButton
                getValue={() => description}
                onResult={setDescription}
                fieldRole="description"
                defaultLocale={storeSourceLocale}
              />
            </div>
            <Textarea
              id="description"
              name="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shared description shown on the family's own page, above the variant picker"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_featured"
              name="is_featured"
              defaultChecked={family?.is_featured ?? false}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <Label htmlFor="is_featured" className="cursor-pointer">
              Show on homepage
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
