"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
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
          if (result.success) {
            toast.success("Synced to Google Merchant Center.");
          } else {
            toast.error("Sync failed — click the error badge on this product for details and next steps.");
          }
        });
      }}
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
    </Button>
  );
}
