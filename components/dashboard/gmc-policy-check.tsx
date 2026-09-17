"use client";

import { useMemo } from "react";
import { AlertTriangle, ShieldCheck, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { validateProductDescription } from "@/lib/gmc-description-policy";

type Props = {
  value: string;
  onAutoFix: (cleanedText: string) => void;
};

export function GmcPolicyCheck({ value, onAutoFix }: Props) {
  const validation = useMemo(() => validateProductDescription(value), [value]);
  const hasContent = value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim().length > 0;

  if (!hasContent) {
    return (
      <Badge variant="outline" className="w-fit text-muted-foreground">
        GMC Policy Check: Waiting for description
      </Badge>
    );
  }

  if (validation.isValid) {
    return (
      <Badge
        variant="outline"
        className="w-fit gap-1 border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        GMC Policy Check: Passed
      </Badge>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />
          GMC Policy Check: Review required
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            onAutoFix(validation.cleanedText);
            toast.success("Forbidden GMC wording removed. Review the description before saving.");
          }}
        >
          <WandSparkles className="mr-1.5 h-3.5 w-3.5" />
          Auto-Fix for GMC Compliance
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Flagged wording:</p>
      <div className="flex flex-wrap gap-1.5" aria-label="GMC policy violations">
        {validation.flaggedTerms.map((term) => (
          <span
            key={term.toLocaleLowerCase()}
            className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive"
          >
            {term}
          </span>
        ))}
      </div>
    </div>
  );
}
