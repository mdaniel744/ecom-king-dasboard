"use client";

import { useTransition } from "react";
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
        startTransition(() => {
          deleteAttribute(attributeId);
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
