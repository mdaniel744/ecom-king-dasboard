"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Clock, MinusCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { GoogleSyncStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  GoogleSyncStatus,
  {
    label: string;
    variant: "outline" | "default" | "destructive" | "secondary";
    className?: string;
    icon: React.ReactNode;
    title: string;
    description: string;
    action?: string;
  }
> = {
  not_synced: {
    label: "not synced",
    variant: "outline",
    icon: <MinusCircle className="h-4 w-4 shrink-0 text-muted-foreground" />,
    title: "Not synced to Google",
    description: "This product has never been pushed to Google Merchant Center. It won't appear in Google Shopping until you sync it.",
    action: 'Click the sync icon (↻) on this row to push it now, or use "Sync All" to push all products at once.',
  },
  pending: {
    label: "pending",
    variant: "secondary",
    icon: <Clock className="h-4 w-4 shrink-0 text-amber-500" />,
    title: "Sync in progress",
    description: "This product is currently being submitted to Google Merchant Center.",
    action: "Refresh the page in a moment to see the updated status.",
  },
  synced: {
    label: "synced",
    variant: "default",
    className: "bg-green-600 hover:bg-green-600/80",
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />,
    title: "Synced to Google",
    description: "This product was successfully submitted to Google Merchant Center. Google will review it — submission accepted does not mean approved yet.",
    action: "Check your Google Merchant Center account to see the final approval status and any item-level issues Google flagged after review.",
  },
  error: {
    label: "error",
    variant: "destructive",
    icon: <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />,
    title: "Sync failed",
    description: "Google Merchant Center rejected or failed to accept this product.",
    action: 'Fix the issue below, then click the sync icon (↻) to retry.',
  },
};

const KNOWN_ERRORS: Array<{ match: RegExp; explanation: string; action: string }> = [
  {
    match: /not registered with the merchant account/i,
    explanation: "The platform's Google service account hasn't been granted access to your Merchant Center account yet.",
    action: "In Google Merchant Center → Settings → Access and services → People and access, add merchant-sync@ecom-king-500706.iam.gserviceaccount.com as Admin. Once added, retry the sync.",
  },
  {
    match: /permission|unauthorized|forbidden/i,
    explanation: "Google rejected the request because the platform doesn't have permission to manage your Merchant Center account.",
    action: "In Google Merchant Center → Settings → People and access, make sure merchant-sync@ecom-king-500706.iam.gserviceaccount.com is listed as Admin.",
  },
  {
    match: /invalid.*merchant.*id|merchant.*id.*invalid/i,
    explanation: "The Merchant Center ID saved in Settings doesn't match any Google account we can reach.",
    action: "Go to Settings → Google Merchant and double-check the Merchant Center ID.",
  },
];

function matchKnown(error: string) {
  for (const rule of KNOWN_ERRORS) {
    if (rule.match.test(error)) return { explanation: rule.explanation, action: rule.action };
  }
  return null;
}

interface Props {
  status: GoogleSyncStatus;
  error: string | null;
}

export function GoogleStatusBadge({ status, error }: Props) {
  const cfg = STATUS_CONFIG[status];
  const known = status === "error" && error ? matchKnown(error) : null;

  const [aiResult, setAiResult] = useState<{ explanation: string; action: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleOpen(open: boolean) {
    if (!open || known || !error || aiResult) return;
    setLoading(true);
    try {
      const res = await fetch("/api/explain-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error }),
      });
      const data = await res.json();
      if (data.explanation) setAiResult(data);
    } catch {
      // silently fall back to raw error
    } finally {
      setLoading(false);
    }
  }

  const friendly = known ?? aiResult;

  return (
    <Popover onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Badge variant={cfg.variant} className={`cursor-pointer ${cfg.className ?? ""}`}>
          {cfg.label}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex items-start gap-2">
          {cfg.icon}
          <div className="space-y-1.5 min-w-0">
            <p className="text-sm font-medium">{cfg.title}</p>

            {loading ? (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analysing error…
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {friendly ? friendly.explanation : cfg.description}
                </p>
                {status === "error" && error && !friendly && (
                  <p className="break-words rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                    {error}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {friendly ? friendly.action : cfg.action}
                </p>
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
