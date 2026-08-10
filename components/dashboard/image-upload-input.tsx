"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadDashboardImage } from "@/app/dashboard/upload-image-action";

type Props = {
  value: string;
  onChange: (url: string) => void;
  /** Scopes the storage path for tidy browsing only — not an access boundary. */
  folder: string;
  emptyLabel?: string;
};

/**
 * Click-to-select image upload — replaces the old "paste an ImageKit URL"
 * text field. `value` stays a plain public URL either way, so anything
 * downstream (products, brands, categories, collections, storefronts) that
 * reads that URL is unaffected by where it came from.
 */
export function ImageUploadInput({ value, onChange, folder, emptyLabel = "Choose Image" }: Props) {
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("folder", folder);
      const result = await uploadDashboardImage(formData);
      if (result.url) {
        onChange(result.url);
      } else {
        toast.error(result.error ?? "Upload failed.");
      }
    } catch {
      toast.error("Upload failed — please try again.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {value ? (
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className="h-16 w-16 rounded-md border border-border object-cover"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background p-0.5 shadow-sm"
            aria-label="Remove image"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        className="gap-1.5"
      >
        {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {isUploading ? "Uploading..." : value ? "Change Image" : emptyLabel}
      </Button>
    </div>
  );
}
