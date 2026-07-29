"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteCollection } from "@/app/dashboard/collections/actions";

export function DeleteCollectionButton({ collectionId }: { collectionId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this collection? Products still linked to it will need a new collection first.")) return;
        startTransition(async () => {
          const result = await deleteCollection(collectionId);
          if (result.success) {
            toast.success("Collection deleted");
          } else {
            toast.error(result.error ?? "Failed to delete collection.");
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
