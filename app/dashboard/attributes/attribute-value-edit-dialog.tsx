"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
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
import { AIWriteButton } from "@/components/dashboard/ai-write-button";
import { updateAttributeValue } from "@/app/dashboard/attributes/actions";
import type { AttributeValue } from "@/lib/types";

export function AttributeValueEditDialog({
  attributeValue,
  attributeName,
  storeSourceLocale = "en",
}: {
  attributeValue: AttributeValue;
  attributeName: string;
  storeSourceLocale?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [avLabel, setAvLabel] = useState(attributeValue.label ?? "");
  const [avDesc, setAvDesc] = useState(attributeValue.description ?? "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Edit ${attributeValue.value}`}>
          <Pencil className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit value — <span className="text-muted-foreground">{attributeName}</span>
          </DialogTitle>
        </DialogHeader>
        <ActionErrorBanner message={error} />
        <form
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = await updateAttributeValue(attributeValue.id, formData);
              if (result.success) {
                toast.success("Value updated");
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
            <Label htmlFor="value">Raw Value *</Label>
            <Input
              id="value"
              name="value"
              required
              defaultValue={attributeValue.value}
              placeholder="e.g. 10ft"
            />
            <p className="text-xs text-muted-foreground">
              The internal filter key. Used to match products and in URLs — keep it short, no spaces.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="label">Display Label</Label>
              <AIWriteButton getValue={() => avLabel} onResult={setAvLabel} fieldRole="label" defaultLocale={storeSourceLocale} />
            </div>
            <Input
              id="label"
              name="label"
              value={avLabel}
              onChange={(e) => setAvLabel(e.target.value)}
              placeholder="e.g. 10 Fuß Container (shown to visitors, falls back to raw value if blank)"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="image_url">Card Image URL</Label>
            <Input
              id="image_url"
              name="image_url"
              defaultValue={attributeValue.image_url ?? ""}
              placeholder="https://... (shown on the storefront category/size card)"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Card Description</Label>
              <AIWriteButton getValue={() => avDesc} onResult={setAvDesc} fieldRole="category_description" defaultLocale={storeSourceLocale} />
            </div>
            <Textarea
              id="description"
              name="description"
              rows={3}
              value={avDesc}
              onChange={(e) => setAvDesc(e.target.value)}
              placeholder="Short text shown under the heading on the storefront card"
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
