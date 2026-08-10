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
import { ImageUploadInput } from "@/components/dashboard/image-upload-input";
import { createBrand, updateBrand } from "@/app/dashboard/brands/actions";
import type { Brand } from "@/lib/types";

export function BrandDialog({
  brand,
  storeSourceLocale = "en",
  enabledLocales = [],
}: {
  brand?: Brand;
  storeSourceLocale?: string;
  enabledLocales?: string[];
}) {
  const isEdit = Boolean(brand);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [logoLightUrl, setLogoLightUrl] = useState(brand?.logo_light_url ?? "");
  const [logoDarkUrl, setLogoDarkUrl] = useState(brand?.logo_dark_url ?? "");
  const [heroImageUrl, setHeroImageUrl] = useState(brand?.hero_image_url ?? "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" title="Edit brand">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Brand
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Brand" : "New Brand"}</DialogTitle>
        </DialogHeader>
        <ActionErrorBanner message={error} />
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = isEdit
                ? await updateBrand(brand!.id, formData)
                : await createBrand(formData);
              if (result.success) {
                toast.success(isEdit ? "Brand updated" : "Brand created");
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
            <Label htmlFor="name">Brand Name *</Label>
            <Input id="name" name="name" required defaultValue={brand?.name ?? ""} placeholder="e.g. Rolex" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug <span className="text-xs font-normal text-muted-foreground">(optional, auto-generated)</span></Label>
            <Input id="slug" name="slug" defaultValue={brand?.slug ?? ""} placeholder="auto-generated from name" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="short_description">Short Description</Label>
            <Input
              id="short_description"
              name="short_description"
              defaultValue={brand?.short_description ?? ""}
              placeholder="Brief summary shown on brand cards"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="long_description">Long Description</Label>
            <Textarea
              id="long_description"
              name="long_description"
              rows={4}
              defaultValue={brand?.long_description ?? ""}
              placeholder="Full brand story shown on the brand's own page"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="disclaimer">Disclaimer <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="disclaimer"
              name="disclaimer"
              rows={2}
              defaultValue={brand?.disclaimer ?? ""}
              placeholder='e.g. "Not an authorized dealer of this brand"'
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Logo (light background)</Label>
              <input type="hidden" name="logo_light_url" value={logoLightUrl} />
              <ImageUploadInput value={logoLightUrl} onChange={setLogoLightUrl} folder="brands" />
            </div>
            <div className="space-y-1.5">
              <Label>Logo (dark background)</Label>
              <input type="hidden" name="logo_dark_url" value={logoDarkUrl} />
              <ImageUploadInput value={logoDarkUrl} onChange={setLogoDarkUrl} folder="brands" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Hero Image <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <input type="hidden" name="hero_image_url" value={heroImageUrl} />
            <ImageUploadInput value={heroImageUrl} onChange={setHeroImageUrl} folder="brands" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta_title">SEO Title <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="meta_title" name="meta_title" defaultValue={brand?.meta_title ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta_description">SEO Description <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="meta_description" name="meta_description" rows={2} defaultValue={brand?.meta_description ?? ""} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>

        {isEdit && (
          <TranslationEditor
            entityType="brand"
            entityId={brand?.id}
            enabledLocales={enabledLocales}
            fields={[
              { name: "name", label: "Brand Name" },
              { name: "short_description", label: "Short Description" },
              { name: "long_description", label: "Long Description", multiline: true },
              { name: "disclaimer", label: "Disclaimer", multiline: true },
              { name: "meta_title", label: "SEO Title" },
              { name: "meta_description", label: "SEO Description", multiline: true },
            ]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
