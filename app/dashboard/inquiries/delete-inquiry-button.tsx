"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteInquiry } from "@/app/dashboard/inquiries/actions";

export function DeleteInquiryButton({ inquiryId }: { inquiryId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this inquiry? This cannot be undone.")) return;
        startTransition(() => {
          deleteInquiry(inquiryId);
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
