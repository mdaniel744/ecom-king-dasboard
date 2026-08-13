import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEP_LABELS } from "@/lib/order-display";

export function OrderTracker({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-start">
      {STEP_LABELS.map((label, i) => {
        const step = i + 1;
        const isComplete = step < currentStep;
        const isActive = step === currentStep;
        return (
          <div key={label} className="flex flex-1 items-start last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-medium",
                  isComplete && "border-emerald-600 bg-emerald-600 text-white",
                  isActive && "border-primary text-primary",
                  !isComplete && !isActive && "border-border text-muted-foreground"
                )}
              >
                {isComplete ? <Check className="h-4 w-4" /> : step}
              </div>
              <span
                className={cn(
                  "mt-2 max-w-[80px] text-center text-xs",
                  isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>
            {step < STEP_LABELS.length && (
              <div className={cn("mt-4 h-0.5 flex-1", isComplete ? "bg-emerald-600" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
