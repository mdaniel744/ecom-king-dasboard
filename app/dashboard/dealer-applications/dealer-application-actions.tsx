"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveDealerApplication, rejectDealerApplication } from "@/app/dashboard/dealer-applications/actions";
import type { DealerApplicationStatus } from "@/lib/types";

export function DealerApplicationActions({
  applicationId,
  status = "pending",
}: {
  applicationId: string;
  status?: DealerApplicationStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handle(
    action: (id: string) => Promise<{ success: boolean; error?: string }>,
    nextStatus: "approved" | "rejected"
  ) {
    startTransition(async () => {
      const result = await action(applicationId);
      if (result.success) {
        toast.success(`Application ${nextStatus}`);
        router.refresh();
      } else {
        const actionLabel = nextStatus === "approved" ? "approve" : "reject";
        toast.error(result.error ?? `Failed to ${actionLabel} application.`);
      }
    });
  }

  return (
    <div className="flex gap-2">
      {status !== "approved" && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          onClick={() => handle(approveDealerApplication, "approved")}
        >
          <Check className="mr-1.5 h-3.5 w-3.5" />
          Approve
        </Button>
      )}
      {status !== "rejected" && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => handle(rejectDealerApplication, "rejected")}
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          Reject
        </Button>
      )}
    </div>
  );
}
