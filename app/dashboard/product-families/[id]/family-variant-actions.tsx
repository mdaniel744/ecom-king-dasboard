"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteProduct } from "@/app/dashboard/products/actions";

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

  function deleteVariant() {
    const confirmed = window.confirm(
      `Permanently delete ${productName}? It will be removed from this family and the database. This cannot be undone.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteProduct(productId);
      if (result.success) {
        toast.success(`${productName} was permanently deleted.`);
        router.refresh();
      } else {
        toast.error(result.error ?? "The product could not be deleted.");
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
        onClick={deleteVariant}
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
        {isPending ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}
