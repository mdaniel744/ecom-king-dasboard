"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteGlossaryTerm } from "@/app/dashboard/glossary/actions";

export function DeleteGlossaryTermButton({ termId }: { termId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this glossary term?")) return;
        startTransition(async () => {
          const result = await deleteGlossaryTerm(termId);
          if (result.success) {
            toast.success("Term deleted");
          } else {
            toast.error(result.error ?? "Failed to delete term.");
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
