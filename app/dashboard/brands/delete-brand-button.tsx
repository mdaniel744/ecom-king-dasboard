"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteBrand } from "@/app/dashboard/brands/actions";

export function DeleteBrandButton({ brandId }: { brandId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this brand? Products or collections still linked to it will need a new brand first.")) return;
        startTransition(async () => {
          const result = await deleteBrand(brandId);
          if (result.success) {
            toast.success("Brand deleted");
          } else {
            toast.error(result.error ?? "Failed to delete brand.");
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
