"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Pencil, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removeProductFromFamily } from "@/app/dashboard/product-families/actions";

export function FamilyVariantActions({
  productId,
  productName,
  currentFamilyId,
}: {
  productId: string;
  productName: string;
  currentFamilyId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const familyHref = `/dashboard/product-families/${currentFamilyId}`;

  function removeFromFamily() {
    const confirmed = window.confirm(
      `Remove ${productName} from this family? It will remain available as a standalone product.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await removeProductFromFamily(productId, currentFamilyId);
      if (result.success) {
        toast.success(`${productName} is now a standalone product.`);
        router.refresh();
      } else {
        toast.error(result.error ?? "The product could not be removed from this family.");
      }
    });
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`${familyHref}?editVariant=${productId}#variant-editor`}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Link>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={isPending}
        onClick={removeFromFamily}
      >
        <Unlink className="mr-1.5 h-3.5 w-3.5" />
        Remove
      </Button>
    </div>
  );
}
