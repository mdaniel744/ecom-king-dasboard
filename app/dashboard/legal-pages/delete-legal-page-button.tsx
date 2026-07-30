"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteLegalPage } from "@/app/dashboard/legal-pages/actions";

export function DeleteLegalPageButton({ pageId }: { pageId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this legal page?")) return;
        startTransition(async () => {
          const result = await deleteLegalPage(pageId);
          if (result.success) {
            toast.success("Page deleted");
          } else {
            toast.error(result.error ?? "Failed to delete page.");
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
