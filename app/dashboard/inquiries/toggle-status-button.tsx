"use client";

import { useTransition } from "react";
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
      onClick={() => startTransition(() => setInquiryStatus(inquiryId, nextStatus))}
    >
      Mark as {nextStatus === "closed" ? "Closed" : "Open"}
    </Button>
  );
}
