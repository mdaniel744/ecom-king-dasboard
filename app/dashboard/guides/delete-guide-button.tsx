"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteGuide } from "@/app/dashboard/guides/actions";

export function DeleteGuideButton({ guideId }: { guideId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this guide?")) return;
        startTransition(async () => {
          const result = await deleteGuide(guideId);
          if (result.success) {
            toast.success("Guide deleted");
          } else {
            toast.error(result.error ?? "Failed to delete guide.");
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
