"use client";

import { useRef, useState, useTransition } from "react";
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
import { updateAttributeValue } from "@/app/dashboard/attributes/actions";
import type { AttributeValue } from "@/lib/types";

export function AttributeValueEditDialog({
  attributeValue,
  attributeName,
}: {
  attributeValue: AttributeValue;
  attributeName: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
          ref={formRef}
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
            <Label htmlFor="label">Display Label</Label>
            <Input
              id="label"
              name="label"
              defaultValue={attributeValue.label ?? ""}
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
            <Label htmlFor="description">Card Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={attributeValue.description ?? ""}
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
