"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, MinusCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { syncAllProductsToGoogle, type BulkSyncResult } from "@/app/dashboard/products/actions";

export function BulkSyncButton({ disabled }: { disabled?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<BulkSyncResult[] | null>(null);

  return (
    <>
      <Button
        variant="outline"
        disabled={disabled || isPending}
        title={disabled ? "Finish store setup in Settings before bulk syncing" : undefined}
        onClick={() => {
          startTransition(async () => {
            const outcome = await syncAllProductsToGoogle();
            setResults(outcome);
          });
        }}
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Syncing…" : (
          <><span className="sm:hidden">Sync</span><span className="hidden sm:inline">Sync All to Google</span></>
        )}
      </Button>

      <Dialog open={results !== null} onOpenChange={(open) => !open && setResults(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Sync Results</DialogTitle>
          </DialogHeader>
          <ul className="space-y-2">
            {results?.map((r) => (
              <li key={r.productId} className="flex items-start gap-2 text-sm">
                {r.status === "synced" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                ) : r.status === "skipped" ? (
                  <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <div>
                  <span className="font-medium">{r.name}</span>
                  {r.status === "synced" ? (
                    <span className="text-muted-foreground"> — synced</span>
                  ) : (
                    <p className="text-muted-foreground">{r.error}</p>
                  )}
                </div>
              </li>
            ))}
            {results?.length === 0 && (
              <li className="text-sm text-muted-foreground">No products to sync.</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
