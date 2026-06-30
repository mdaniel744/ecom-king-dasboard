"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncProductToGoogle } from "@/app/dashboard/products/actions";

export function SyncGoogleButton({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      title="Sync to Google Merchant"
      onClick={() => {
        startTransition(async () => {
          const result = await syncProductToGoogle(productId);
          if (!result.success) {
            alert(result.error ?? "Failed to sync to Google Merchant.");
          }
        });
      }}
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
    </Button>
  );
}
