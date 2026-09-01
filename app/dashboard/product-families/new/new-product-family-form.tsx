"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Boxes, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionErrorBanner } from "@/components/dashboard/action-error-banner";
import { AIWriteButton } from "@/components/dashboard/ai-write-button";
import { ImageUploadInput } from "@/components/dashboard/image-upload-input";
import { createProductFamilyWithVariants } from "@/app/dashboard/product-families/actions";
import type { Category } from "@/lib/types";
import type { AttributeDef } from "@/lib/attribute-defs";

const MAX_VARIANTS = 100;

export function NewProductFamilyForm({
  categories,
  attributeDefs,
  storeSourceLocale,
}: {
  categories: Category[];
  attributeDefs: AttributeDef[];
  storeSourceLocale: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  const usableAttributes = attributeDefs.filter((attribute) => attribute.values.length > 0);
  const selectedAxes = useMemo(
    () =>
      usableAttributes
        .map((attribute) => ({
          name: attribute.name,
          values: Array.from(selected[attribute.name] ?? []),
        }))
        .filter((attribute) => attribute.values.length > 0),
    [selected, usableAttributes]
  );

  const combinations = useMemo(() => {
    if (selectedAxes.length === 0) return [];
    return selectedAxes.reduce<Record<string, string>[]>(
      (current, axis) =>
        current.flatMap((combination) =>
          axis.values.map((value) => ({ ...combination, [axis.name]: value }))
        ),
      [{}]
    );
  }, [selectedAxes]);

  function toggleValue(attributeName: string, value: string, checked: boolean) {
    setSelected((current) => {
      const next = { ...current };
      const values = new Set(next[attributeName] ?? []);
      if (checked) values.add(value);
      else values.delete(value);
      next[attributeName] = values;
      return next;
    });
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createProductFamilyWithVariants(formData);
      if (result.success) {
        toast.success(
          `Created ${result.data.created} product variation${result.data.created === 1 ? "" : "s"} as drafts.`
        );
        router.push(`/dashboard/product-families/${result.data.familyId}`);
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href="/dashboard/product-families" aria-label="Back to product families">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">New Product Family</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            A variable product is a family of related products displayed on one product page.
            Every generated variation remains a complete product with its own price, stock, SKU,
            images, description, and publishing status.
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="mt-6 max-w-4xl space-y-6">
        <ActionErrorBanner message={error} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                1
              </span>
              Product family details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Family title *</Label>
              <Input
                id="name"
                name="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Classic Hoodie"
              />
              <p className="text-xs text-muted-foreground">
                This title appears on the Product Families list and groups every variation below it.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="category_id">Category</Label>
              <Select name="category_id">
                <SelectTrigger id="category_id">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Family image</Label>
              <input type="hidden" name="image_url" value={imageUrl} />
              <ImageUploadInput value={imageUrl} onChange={setImageUrl} folder="product-families" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="short_description">Short description</Label>
                <AIWriteButton
                  getValue={() => shortDescription}
                  onResult={setShortDescription}
                  fieldRole="short_description"
                  defaultLocale={storeSourceLocale}
                />
              </div>
              <Textarea
                id="short_description"
                name="short_description"
                rows={2}
                value={shortDescription}
                onChange={(event) => setShortDescription(event.target.value)}
                placeholder="A short summary for family listings"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Family description</Label>
                <AIWriteButton
                  getValue={() => description}
                  onResult={setDescription}
                  fieldRole="description"
                  defaultLocale={storeSourceLocale}
                />
              </div>
              <Textarea
                id="description"
                name="description"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Shared introduction displayed above the variation selector"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_featured"
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Show this product family on the homepage
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                2
              </span>
              Select variation attributes
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose the related attributes and values customers will switch between. Every
              possible combination becomes its own editable draft product.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {usableAttributes.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No attributes with values are available. Create attributes such as Size or Colour
                on the{" "}
                <Link href="/dashboard/attributes" className="font-medium text-primary underline">
                  Attributes page
                </Link>{" "}
                first.
              </div>
            ) : (
              usableAttributes.map((attribute) => {
                const selectedValues = selected[attribute.name] ?? new Set<string>();
                return (
                  <div key={attribute.name} className="rounded-lg border p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <Label className="font-semibold">{attribute.name}</Label>
                      <span className="text-xs text-muted-foreground">
                        {selectedValues.size === 0
                          ? "Not used"
                          : `${selectedValues.size} value${selectedValues.size === 1 ? "" : "s"} selected`}
                      </span>
                    </div>
                    {selectedValues.size > 0 && (
                      <input type="hidden" name="selected_attributes" value={attribute.name} />
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {attribute.values.map((value) => (
                        <label
                          key={value}
                          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            name={`values:${attribute.name}`}
                            value={value}
                            checked={selectedValues.has(value)}
                            onChange={(event) =>
                              toggleValue(attribute.name, value, event.target.checked)
                            }
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          {value}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {combinations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="h-4 w-4" />
                Variation preview ({combinations.length})
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                These draft products will be created. After generation, each block gets a View / Edit
                button for completing the normal product form.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {combinations.map((combination) => {
                const values = Object.values(combination);
                return (
                  <div key={JSON.stringify(combination)} className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">
                        {name.trim() || "Untitled family"} — {values.join(", ")}
                      </p>
                      <Badge variant="secondary">Draft</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(combination).map(([attribute, value]) => (
                        <Badge key={attribute} variant="outline" className="font-normal">
                          {attribute}: {value}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">
              {combinations.length === 0
                ? "Select at least one attribute value to continue."
                : combinations.length > MAX_VARIANTS
                  ? `Reduce the selection to ${MAX_VARIANTS} variations or fewer.`
                  : `${combinations.length} independent draft product${combinations.length === 1 ? "" : "s"} will be created.`}
            </p>
            <p className="text-xs text-muted-foreground">
              Drafts stay offline until their individual product details are completed and activated.
            </p>
          </div>
          <Button
            type="submit"
            disabled={
              isPending ||
              !name.trim() ||
              combinations.length === 0 ||
              combinations.length > MAX_VARIANTS
            }
            className="shrink-0"
          >
            <Wand2 className="mr-2 h-4 w-4" />
            {isPending
              ? "Generating..."
              : `Generate ${combinations.length || ""} Product Variation${combinations.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </form>
    </div>
  );
}
