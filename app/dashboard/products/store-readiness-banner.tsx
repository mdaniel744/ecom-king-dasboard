import Link from "next/link";
import { AlertCircle } from "lucide-react";
import type { RuleIssue } from "@/lib/merchant-rules";

export function StoreReadinessBanner({ issues }: { issues: RuleIssue[] }) {
  if (issues.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium">
            This store isn&apos;t set up to sync with Google Merchant yet
          </p>
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            {issues.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
          <Link
            href="/dashboard/settings"
            className="inline-block text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Go to Settings →
          </Link>
        </div>
      </div>
    </div>
  );
}
