"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteFaq } from "@/app/dashboard/faqs/actions";

export function DeleteFaqButton({ faqId }: { faqId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this FAQ?")) return;
        startTransition(async () => {
          const result = await deleteFaq(faqId);
          if (result.success) {
            toast.success("FAQ deleted");
          } else {
            toast.error(result.error ?? "Failed to delete FAQ.");
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
