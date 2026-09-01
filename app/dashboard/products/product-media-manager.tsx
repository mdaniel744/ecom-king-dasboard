"use client";

import { useRef, useState } from "react";
import {
  Check,
  ImageIcon,
  ImagePlus,
  Link2,
  Loader2,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { uploadDashboardImage } from "@/app/dashboard/upload-image-action";
import { generateImageAlt } from "@/app/dashboard/products/generate-alt-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldInfo } from "@/components/ui/field-info";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_MEDIA_ITEMS = 20;

export type ProductMediaItem = {
  id: string;
  url: string;
  title: string;
  alt: string;
  description: string;
};

type Props = {
  initialItems: ProductMediaItem[];
  productName: string;
  productDescription: string;
  brand: string;
};

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validMediaUrl(value: string) {
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function ProductMediaManager({
  initialItems,
  productName,
  productDescription,
  brand,
}: Props) {
  const [items, setItems] = useState<ProductMediaItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState(initialItems[0]?.id ?? "");
  const [linkedUrl, setLinkedUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(
    null
  );
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(() => new Set());
  const [generatingAltId, setGeneratingAltId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(initialItems.length);

  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId)
  );
  const selectedItem = items[selectedIndex] ?? null;
  const selectedMediaCount = bulkSelectedIds.size;
  const allMediaSelected = items.length > 0 && selectedMediaCount === items.length;

  function updateItem(id: string, patch: Partial<Omit<ProductMediaItem, "id">>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function removeItem(id: string) {
    const removedIndex = items.findIndex((item) => item.id === id);
    const next = items.filter((item) => item.id !== id);
    const nextSelection = next[Math.min(Math.max(removedIndex, 0), next.length - 1)];
    setItems(next);
    setSelectedId(nextSelection?.id ?? "");
    setBulkSelectedIds((current) => {
      const updated = new Set(current);
      updated.delete(id);
      return updated;
    });
    toast.success("Image removed from this product. Save the product to apply the change.");
  }

  function toggleBulkSelection(id: string) {
    setBulkSelectedIds((current) => {
      const updated = new Set(current);
      if (updated.has(id)) updated.delete(id);
      else updated.add(id);
      return updated;
    });
  }

  function toggleSelectAll() {
    setBulkSelectedIds(allMediaSelected ? new Set() : new Set(items.map((item) => item.id)));
  }

  function removeSelectedItems() {
    if (bulkSelectedIds.size === 0) return;

    const removedIds = new Set(bulkSelectedIds);
    const next = items.filter((item) => !removedIds.has(item.id));
    const removedCount = items.length - next.length;
    setItems(next);
    setSelectedId((current) =>
      removedIds.has(current) ? (next[0]?.id ?? "") : current
    );
    setBulkSelectedIds(new Set());
    toast.success(
      `${removedCount} image${removedCount === 1 ? "" : "s"} removed from this product. Save the product to apply the change.`
    );
  }

  function makeMainImage(id: string) {
    setItems((current) => {
      const item = current.find((entry) => entry.id === id);
      if (!item) return current;
      return [item, ...current.filter((entry) => entry.id !== id)];
    });
    setSelectedId(id);
  }

  function addLinkedImage() {
    const url = linkedUrl.trim();
    if (!url) return;
    if (items.length >= MAX_MEDIA_ITEMS) {
      toast.error(`A product can have up to ${MAX_MEDIA_ITEMS} images.`);
      return;
    }
    if (url.length > 2000 || !validMediaUrl(url)) {
      toast.error("Enter a valid image link beginning with https://, http://, or /.");
      return;
    }

    const id = `linked-${nextIdRef.current++}`;
    setItems((current) => [
      ...current,
      { id, url, title: "", alt: "", description: "" },
    ]);
    setSelectedId(id);
    setLinkedUrl("");
  }

  async function addUploadedImages(fileList: FileList) {
    const availableSlots = MAX_MEDIA_ITEMS - items.length;
    const files = Array.from(fileList).slice(0, availableSlots);
    if (files.length === 0) {
      toast.error(`A product can have up to ${MAX_MEDIA_ITEMS} images.`);
      return;
    }
    if (fileList.length > availableSlots) {
      toast.info(
        `Only ${availableSlots} image${availableSlots === 1 ? "" : "s"} can be added because the product limit is ${MAX_MEDIA_ITEMS}.`
      );
    }

    setIsUploading(true);
    setUploadProgress({ completed: 0, total: files.length });
    try {
      const uploadedItems: ProductMediaItem[] = [];

      for (const [index, file] of files.entries()) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("folder", "products");
        const result = await uploadDashboardImage(formData);

        if (result.url) {
          uploadedItems.push({
            id: `upload-${nextIdRef.current++}`,
            url: result.url,
            title: titleFromFilename(file.name),
            alt: "",
            description: "",
          });
        } else {
          toast.error(result.error ?? `Failed to upload ${file.name}`);
        }
        setUploadProgress({ completed: index + 1, total: files.length });
      }

      if (uploadedItems.length === 0) return;

      setItems((current) => [...current, ...uploadedItems]);
      setSelectedId(uploadedItems[0].id);
      toast.success(
        `${uploadedItems.length} image${uploadedItems.length > 1 ? "s" : ""} added to this product`
      );

      if (productName.trim()) {
        await Promise.all(
          uploadedItems.map(async (item, index) => {
            try {
              const result = await generateImageAlt(
                productName,
                productDescription || null,
                brand || null,
                items.length + index
              );
              if (result.alt) updateItem(item.id, { alt: result.alt });
            } catch {
              // Alt generation is optional; the details panel remains editable.
            }
          })
        );
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function generateSelectedAlt(item: ProductMediaItem, index: number) {
    if (!productName.trim()) {
      toast.error("Fill in the product title first so the alt text can describe it accurately.");
      return;
    }

    setGeneratingAltId(item.id);
    try {
      const result = await generateImageAlt(
        productName,
        productDescription || null,
        brand || null,
        index
      );
      if (result.alt) {
        updateItem(item.id, { alt: result.alt });
        toast.success("Alt text generated — review it against the selected image.");
      } else {
        toast.error(result.error ?? "Could not generate alt text.");
      }
    } catch {
      toast.error("Alt text generation failed — please try again.");
    } finally {
      setGeneratingAltId(null);
    }
  }

  return (
    <Card className="mt-4">
      {items.map((item) => (
        <div key={`fields-${item.id}`}>
          <input type="hidden" name="images" value={item.url} />
          <input type="hidden" name="image_titles" value={item.title} />
          <input type="hidden" name="image_alts" value={item.alt} />
          <input type="hidden" name="image_descriptions" value={item.description} />
        </div>
      ))}

      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">Product Media</CardTitle>
            <FieldInfo
              title="Product-scoped media manager"
              description="This grid only contains images attached to the product you are currently creating or editing. Image titles, alt text, and descriptions make the media easier to understand for search engines and assistive technology. The first image is used as the main product image."
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} of {MAX_MEDIA_ITEMS} images · choose several files in one upload
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length) addUploadedImages(event.target.files);
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={isUploading || items.length >= MAX_MEDIA_ITEMS}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="mr-2 h-4 w-4" />
            )}
            {isUploading && uploadProgress
              ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}`
              : "Upload Images"}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              inputMode="url"
              value={linkedUrl}
              onChange={(event) => setLinkedUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addLinkedImage();
                }
              }}
              placeholder="Paste an image link to attach it to this product"
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!linkedUrl.trim() || items.length >= MAX_MEDIA_ITEMS}
            onClick={addLinkedImage}
          >
            Add Link
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-label="Product image grid">
            {items.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-8 text-center">
                <div className="mb-4 rounded-full bg-muted p-4">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-medium">No product media yet</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Upload product photos or add an image link. They will appear here as a private working set for this product.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Choose Product Images
                </Button>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex flex-col gap-2 rounded-lg border bg-muted/25 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {selectedMediaCount > 0
                      ? `${selectedMediaCount} of ${items.length} selected`
                      : "Select images using the checkboxes for bulk actions"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={toggleSelectAll}>
                      {allMediaSelected ? "Clear selection" : "Select all"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={selectedMediaCount === 0}
                      onClick={removeSelectedItems}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete selected
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {items.map((item, index) => {
                    const isSelected = item.id === selectedItem?.id;
                    const isBulkSelected = bulkSelectedIds.has(item.id);
                    const accessibleName = item.alt || item.title || `Product image ${index + 1}`;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "group relative overflow-hidden rounded-lg border bg-muted text-left transition",
                          isBulkSelected
                            ? "border-destructive ring-2 ring-destructive/25"
                            : isSelected
                              ? "border-primary ring-2 ring-primary/25"
                              : "hover:border-foreground/30 hover:shadow-sm"
                        )}
                      >
                        <button
                          type="button"
                          aria-label={`Open details for ${accessibleName}`}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedId(item.id)}
                          className="block w-full text-left"
                        >
                          <div className="aspect-square bg-muted/50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.url}
                              alt={item.alt}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="border-t bg-card px-2.5 py-2">
                            <p className="truncate text-xs font-medium">
                              {item.title || `Image ${index + 1}`}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {index === 0 ? "Main image" : `Image ${index + 1}`}
                            </p>
                          </div>
                          {index === 0 && (
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-[10px] font-medium shadow-sm backdrop-blur">
                              <Star className="h-3 w-3 fill-current" />
                              Main
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`${isBulkSelected ? "Deselect" : "Select"} ${accessibleName} for bulk actions`}
                          aria-pressed={isBulkSelected}
                          onClick={() => toggleBulkSelection(item.id)}
                          className={cn(
                            "absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border shadow-sm backdrop-blur transition",
                            isBulkSelected
                              ? "border-destructive bg-destructive text-destructive-foreground"
                              : "border-border bg-background/90 text-transparent hover:text-muted-foreground"
                          )}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <aside className="rounded-xl border bg-muted/20 p-4 lg:sticky lg:top-4 lg:self-start">
            {selectedItem ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Media details</p>
                    <p className="text-xs text-muted-foreground">
                      Image {selectedIndex + 1} of {items.length}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove selected image"
                    onClick={() => removeItem(selectedItem.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <div className="aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedItem.url}
                    alt={selectedItem.alt}
                    className="h-full w-full object-contain"
                  />
                </div>

                {selectedIndex !== 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => makeMainImage(selectedItem.id)}
                  >
                    <Star className="mr-2 h-4 w-4" />
                    Set as Main Image
                  </Button>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor={`media-link-${selectedItem.id}`}>Media link</Label>
                  <Input
                    id={`media-link-${selectedItem.id}`}
                    type="text"
                    inputMode="url"
                    maxLength={2000}
                    value={selectedItem.url}
                    onChange={(event) => updateItem(selectedItem.id, { url: event.target.value })}
                    placeholder="https://example.com/product.jpg"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`media-title-${selectedItem.id}`}>Image title</Label>
                  <Input
                    id={`media-title-${selectedItem.id}`}
                    maxLength={500}
                    value={selectedItem.title}
                    onChange={(event) => updateItem(selectedItem.id, { title: event.target.value })}
                    placeholder="Descriptive internal image title"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`media-alt-${selectedItem.id}`}>Image alt text</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={generatingAltId === selectedItem.id}
                      onClick={() => generateSelectedAlt(selectedItem, selectedIndex)}
                      className="h-7 gap-1 px-2 text-xs"
                    >
                      <Sparkles className="h-3 w-3" />
                      {generatingAltId === selectedItem.id ? "Generating..." : "Generate"}
                    </Button>
                  </div>
                  <Input
                    id={`media-alt-${selectedItem.id}`}
                    maxLength={500}
                    value={selectedItem.alt}
                    onChange={(event) => updateItem(selectedItem.id, { alt: event.target.value })}
                    placeholder="Describe what is visible in this image"
                  />
                  <p className="text-xs text-muted-foreground">
                    Describe the product, colour, angle, and important visible details naturally.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`media-description-${selectedItem.id}`}>
                    Image description
                  </Label>
                  <Textarea
                    id={`media-description-${selectedItem.id}`}
                    rows={4}
                    maxLength={2000}
                    value={selectedItem.description}
                    onChange={(event) =>
                      updateItem(selectedItem.id, { description: event.target.value })
                    }
                    placeholder="Add context, composition, product details, or intended use for this media"
                  />
                </div>
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <ImageIcon className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Media details</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add or select an image to manage its SEO information.
                </p>
              </div>
            )}
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}
