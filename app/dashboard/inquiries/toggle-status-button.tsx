"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setInquiryStatus } from "@/app/dashboard/inquiries/actions";
import type { InquiryStatus } from "@/lib/types";

export function ToggleStatusButton({
  inquiryId,
  status,
}: {
  inquiryId: string;
  status: InquiryStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const nextStatus: InquiryStatus = status === "open" ? "closed" : "open";

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await setInquiryStatus(inquiryId, nextStatus);
          if (result.success) {
            toast.success(`Marked as ${nextStatus}`);
          } else {
            toast.error(result.error ?? "Failed to update status.");
          }
        });
      }}
    >
      Mark as {nextStatus === "closed" ? "Closed" : "Open"}
    </Button>
  );
}
