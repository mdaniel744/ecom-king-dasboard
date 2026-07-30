"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveDealerApplication, rejectDealerApplication } from "@/app/dashboard/dealer-applications/actions";

export function DealerApplicationActions({ applicationId }: { applicationId: string }) {
  const [isPending, startTransition] = useTransition();

  function handle(action: (id: string) => Promise<{ success: boolean; error?: string }>, verb: string) {
    startTransition(async () => {
      const result = await action(applicationId);
      if (result.success) {
        toast.success(`Application ${verb}`);
      } else {
        toast.error(result.error ?? `Failed to ${verb.replace("d", "")} application.`);
      }
    });
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => handle(approveDealerApplication, "approved")}
      >
        <Check className="mr-1.5 h-3.5 w-3.5" />
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        className="text-destructive hover:text-destructive"
        onClick={() => handle(rejectDealerApplication, "rejected")}
      >
        <X className="mr-1.5 h-3.5 w-3.5" />
        Reject
      </Button>
    </div>
  );
}
