"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionErrorBanner } from "@/components/dashboard/action-error-banner";
import { generateFamilyVariants } from "@/app/dashboard/product-families/actions";
import type { ProductFamily } from "@/lib/types";
import type { AttributeDef } from "@/lib/attribute-defs";

export function GenerateVariantsForm({
  family,
  attributeDefs,
}: {
  family: ProductFamily;
  attributeDefs: AttributeDef[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // { [attributeName]: Set of selected values }
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  const usableAttributes = attributeDefs.filter((a) => a.values.length > 0);

  const comboCount = useMemo(() => {
    const axes = Object.values(selected).filter((set) => set.size > 0);
    if (axes.length === 0) return 0;
    return axes.reduce((total, set) => total * set.size, 1);
  }, [selected]);

  function toggleValue(attrName: string, value: string, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[attrName] ?? []);
      if (checked) set.add(value);
      else set.delete(value);
      next[attrName] = set;
      return next;
    });
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await generateFamilyVariants(family.id, formData);
      if (result.success) {
        const { created, skipped } = result.data;
        toast.success(
          skipped > 0
            ? `Created ${created} new variant${created === 1 ? "" : "s"} (${skipped} combination${skipped === 1 ? "" : "s"} already existed, skipped).`
            : `Created ${created} new variant${created === 1 ? "" : "s"} as drafts.`
        );
        router.push(`/dashboard/product-families/${family.id}`);
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/dashboard/product-families">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Generate Product Variations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            For the <strong>{family.name}</strong> family — pick which attributes vary and which
            values to include; one product gets created per combination.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <ActionErrorBanner message={error} />
      </div>

      <form action={handleSubmit} className="mt-6 max-w-2xl space-y-4">
        {usableAttributes.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No attributes with saved values yet — add some on the{" "}
              <Link href="/dashboard/attributes" className="text-primary underline">
                Attributes page
              </Link>{" "}
              first (e.g. Size: 20ft/40ft), then come back here.
            </CardContent>
          </Card>
        ) : (
          usableAttributes.map((attr) => {
            const attrSelected = selected[attr.name] ?? new Set<string>();
            const attrIncluded = attrSelected.size > 0;
            return (
              <Card key={attr.name}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{attr.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  {attrIncluded && (
                    <input type="hidden" name="selected_attributes" value={attr.name} />
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                    {attr.values.map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name={`values:${attr.name}`}
                          value={value}
                          checked={attrSelected.has(value)}
                          onChange={(e) => toggleValue(attr.name, value, e.target.checked)}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        {value}
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}

        {usableAttributes.length > 0 && (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
            <div>
              <Label className="text-sm">
                {comboCount === 0
                  ? "Pick at least one value to see how many variants this will create."
                  : `This will create ${comboCount} product${comboCount === 1 ? "" : "s"}.`}
              </Label>
              <p className="text-xs text-muted-foreground">
                Created as independent drafts. The family page will list every generated product
                with a View / Edit button so you can complete its normal product form. Existing
                combinations are skipped, not duplicated.
              </p>
            </div>
            <Button type="submit" disabled={isPending || comboCount === 0}>
              {isPending
                ? "Generating..."
                : `Generate ${comboCount || ""} Product Variation${comboCount === 1 ? "" : "s"}`}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
