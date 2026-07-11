"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
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
import { createAttribute, updateAttribute } from "@/app/dashboard/attributes/actions";
import type { Attribute } from "@/lib/types";

export function AttributeDialog({ attribute }: { attribute?: Attribute }) {
  const isEdit = Boolean(attribute);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" title="Edit attribute">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Attribute
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Attribute" : "New Attribute"}</DialogTitle>
        </DialogHeader>
        <ActionErrorBanner message={error} />
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = isEdit
                ? await updateAttribute(attribute!.id, formData)
                : await createAttribute(formData);
              if (result.success) {
                toast.success(isEdit ? "Attribute updated" : "Attribute created");
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
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="e.g. Size, Material, Color"
              defaultValue={attribute?.name ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="values">{isEdit ? "Add Values" : "Values"}</Label>
            <Input
              id="values"
              name="values"
              placeholder="Comma-separated, e.g. 20ft, 40ft, 40ft HC"
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                New values are added to the existing ones — nothing is removed here. To edit or
                remove an existing value, click its pencil icon in the Values column.
              </p>
            )}
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
