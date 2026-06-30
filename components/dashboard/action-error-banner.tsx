import { AlertCircle } from "lucide-react";

export function ActionErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
