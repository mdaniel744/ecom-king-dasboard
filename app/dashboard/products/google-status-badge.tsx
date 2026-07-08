"use client";

import { CheckCircle2, AlertCircle, Clock, MinusCircle } from "lucide-react";
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
    description:
      "This product has never been pushed to Google Merchant Center. It won't appear in Google Shopping until you sync it.",
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
    description:
      "This product was successfully submitted to Google Merchant Center. Google will review it — submission accepted does not mean approved yet.",
    action:
      "Check your Google Merchant Center account to see the final approval status and any item-level issues Google flagged after review.",
  },
  error: {
    label: "error",
    variant: "destructive",
    icon: <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />,
    title: "Sync failed",
    description: "Google Merchant Center rejected or failed to accept this product.",
    action:
      'Fix the issue described below, then click the sync icon (↻) to retry. If the product passes Merchant Readiness checks, the error is likely a Google-side validation — check your Merchant Center account for more detail.',
  },
};

const FRIENDLY_ERRORS: Array<{ match: RegExp; message: string; action: string }> = [
  {
    match: /not registered with the merchant account/i,
    message: "This platform hasn't been connected to your Google Merchant Center account yet.",
    action:
      "Go to Settings → Google Merchant and make sure your Merchant Center ID is saved. If it is, contact your administrator to complete the one-time platform registration with Google.",
  },
  {
    match: /invalid.*merchant.*id|merchant.*id.*invalid/i,
    message: "The Merchant Center ID saved in Settings doesn't match any Google account we can reach.",
    action: "Go to Settings → Google Merchant and double-check the Merchant Center ID.",
  },
  {
    match: /permission|unauthorized|forbidden/i,
    message: "Google rejected the request because this platform doesn't have permission to manage your Merchant Center account.",
    action:
      "In Google Merchant Center → Settings → People & access, make sure the platform service account is added as an Admin.",
  },
];

function friendlyError(raw: string): { message: string; action: string } | null {
  for (const rule of FRIENDLY_ERRORS) {
    if (rule.match.test(raw)) {
      return { message: rule.message, action: rule.action };
    }
  }
  return null;
}

interface Props {
  status: GoogleSyncStatus;
  error: string | null;
}

export function GoogleStatusBadge({ status, error }: Props) {
  const cfg = STATUS_CONFIG[status];
  const friendly = status === "error" && error ? friendlyError(error) : null;

  return (
    <Popover>
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
            <p className="text-sm text-muted-foreground">
              {friendly ? friendly.message : cfg.description}
            </p>
            <p className="text-xs text-muted-foreground">
              {friendly ? friendly.action : cfg.action}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
