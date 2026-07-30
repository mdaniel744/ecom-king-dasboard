"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteWebsiteString } from "@/app/dashboard/website-strings/actions";

export function DeleteWebsiteStringButton({ stringId }: { stringId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this string?")) return;
        startTransition(async () => {
          const result = await deleteWebsiteString(stringId);
          if (result.success) {
            toast.success("String deleted");
          } else {
            toast.error(result.error ?? "Failed to delete string.");
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
