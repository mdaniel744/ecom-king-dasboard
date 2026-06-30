"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteAttribute } from "@/app/dashboard/attributes/actions";

export function DeleteAttributeButton({ attributeId }: { attributeId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this attribute and all its values?")) return;
        startTransition(async () => {
          const result = await deleteAttribute(attributeId);
          if (result.success) {
            toast.success("Attribute deleted");
          } else {
            toast.error(result.error ?? "Failed to delete attribute.");
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
