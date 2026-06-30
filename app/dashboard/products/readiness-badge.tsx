"use client";

import { AlertCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RuleIssue } from "@/lib/merchant-rules";

export function ReadinessBadge({ issues }: { issues: RuleIssue[] }) {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  if (errorCount === 0 && warningCount === 0) {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-600/80">
        Ready
      </Badge>
    );
  }

  const label = [
    errorCount > 0 ? `${errorCount} issue${errorCount > 1 ? "s" : ""}` : null,
    warningCount > 0 ? `${warningCount} warning${warningCount > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant={errorCount > 0 ? "destructive" : "secondary"}
          className="cursor-pointer"
        >
          {label}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <p className="mb-2 text-sm font-medium">Why this isn&apos;t ready</p>
        <ul className="space-y-2">
          {issues.map((issue, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {issue.severity === "error" ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              )}
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
