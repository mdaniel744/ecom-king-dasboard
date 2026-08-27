"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteProductFamily } from "@/app/dashboard/product-families/actions";

export function DeleteFamilyButton({ familyId }: { familyId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this family? Its member products are not deleted — they just become standalone products again.")) return;
        startTransition(async () => {
          const result = await deleteProductFamily(familyId);
          if (result.success) {
            toast.success("Family deleted");
          } else {
            toast.error(result.error ?? "Failed to delete family.");
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
