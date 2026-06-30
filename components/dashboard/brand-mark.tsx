import { Boxes } from "lucide-react";

export function BrandMark({ storeName }: { storeName?: string }) {
  return (
    <div className="flex items-center gap-3 px-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Boxes className="h-5 w-5" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">{storeName ?? "Console"}</span>
        <span className="text-xs text-muted-foreground">Store Admin</span>
      </div>
    </div>
  );
}
