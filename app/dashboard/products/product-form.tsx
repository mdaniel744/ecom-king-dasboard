"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/dashboard/field-error";
import { ActionErrorBanner } from "@/components/dashboard/action-error-banner";
import { AIWriteButton } from "@/components/dashboard/ai-write-button";
import type { Category, Product } from "@/lib/types";
import type { AttributeDef } from "@/lib/attribute-defs";
import type { ActionResult } from "@/lib/action-result";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";

type Props = {
  action: (formData: FormData) => Promise<ActionResult>;
  product?: Product;
  categories: Category[];
  attributeDefs: AttributeDef[];
  storeSourceLocale?: string;
};

export function ProductForm({ action, product, categories, attributeDefs, storeSourceLocale = "en" }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState(product?.name ?? "");
  const [shortDescription, setShortDescription] = useState(product?.short_description ?? "");
  const [description, setDescription] = useState(product?.description ?? "");

  const initialAttrs = product?.attributes ? Object.entries(product.attributes) : [];
  const [attrs, setAttrs] = useState<[string, string][]>(
    initialAttrs.length ? initialAttrs : [["", ""]]
  );

  const [images, setImages] = useState<string[]>(
    product?.images?.length ? product.images : [""]
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        toast.success(product ? "Product updated" : "Product created");
        router.push("/dashboard/products");
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors);
        toast.error(result.error);
      }
    });
  }

  function updateImage(index: number, newValue: string) {
    setImages((prev) => prev.map((url, i) => (i === index ? newValue : url)));
  }

  function updateAttr(index: number, field: 0 | 1, newValue: string) {
    setAttrs((prev) => {
      const next = [...prev];
      next[index] = field === 0 ? [newValue, next[index][1]] : [next[index][0], newValue];
      return next;
    });
  }

  function valueSuggestionsFor(key: string): string[] {
    const match = attributeDefs.find(
      (def) => def.name.trim().toLowerCase() === key.trim().toLowerCase()
    );
    return match?.values ?? [];
  }

  return (
    <form action={handleSubmit}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/dashboard/products">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">
            {product ? "Edit Product" : "New Product"}
          </h1>
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="mt-4">
        <ActionErrorBanner message={error} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="name">Title *</Label>
                  <AIWriteButton getValue={() => name} onResult={setName} fieldRole="name" defaultLocale={storeSourceLocale} />
                </div>
                <Input
                  id="name"
                  name="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 20ft High Cube Container"
                />
                <FieldError name="name" errors={fieldErrors} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">URL Slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={product?.slug}
                  placeholder="auto-generated from title if left blank"
                />
                <FieldError name="slug" errors={fieldErrors} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="short_description">Short Description</Label>
                  <AIWriteButton getValue={() => shortDescription} onResult={setShortDescription} fieldRole="short_description" defaultLocale={storeSourceLocale} />
                </div>
                <Input
                  id="short_description"
                  name="short_description"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  placeholder="Brief summary shown on product cards"
                />
                <FieldError name="short_description" errors={fieldErrors} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description">Description</Label>
                  <AIWriteButton getValue={() => description} onResult={setDescription} fieldRole="description" defaultLocale={storeSourceLocale} />
                </div>
                <Textarea
                  id="description"
                  name="description"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Full product description..."
                />
                <FieldError name="description" errors={fieldErrors} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attributes</CardTitle>
              <p className="text-sm text-muted-foreground">
                Add only what this product needs. Suggestions come from
                values you&apos;ve saved before — type your own anytime if
                what you need isn&apos;t listed.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {attrs.map(([key, value], i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex-1">
                    <CreatableCombobox
                      name="attr_key"
                      value={key}
                      onChange={(v) => updateAttr(i, 0, v)}
                      options={attributeDefs.map((def) => def.name)}
                      placeholder="Attribute (e.g. Material)"
                    />
                  </div>
                  <div className="flex-1">
                    <CreatableCombobox
                      name="attr_value"
                      value={value}
                      onChange={(v) => updateAttr(i, 1, v)}
                      options={valueSuggestionsFor(key)}
                      placeholder="Value (e.g. Corten Steel)"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setAttrs(attrs.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAttrs([...attrs, ["", ""]])}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add attribute
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Images</CardTitle>
              <p className="text-sm text-muted-foreground">
                First image is the main one. Paste a hosted URL per box —
                e.g. from ImageKit or any other image host.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {images.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    name="images"
                    value={url}
                    onChange={(e) => updateImage(i, e.target.value)}
                    placeholder="https://..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImages([...images, ""])}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add image
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Classification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="price">Price *</Label>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={product?.price ?? ""}
                  />
                  <FieldError name="price" errors={fieldErrors} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency">Currency</Label>
                  <Select name="currency" defaultValue={product?.currency ?? "USD"}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError name="currency" errors={fieldErrors} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sale_price">Sale Price (optional)</Label>
                <Input
                  id="sale_price"
                  name="sale_price"
                  type="number"
                  step="0.01"
                  defaultValue={product?.sale_price ?? ""}
                  placeholder="Leave blank if not on sale"
                />
                <FieldError name="sale_price" errors={fieldErrors} />
                <p className="text-xs text-muted-foreground">
                  Shown to Google as a discounted price next to the regular
                  price — must be lower than Price.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue={product?.status ?? "draft"}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                {/* hidden native select keeps the value submitted with the form */}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="condition">Condition</Label>
                <Select name="condition" defaultValue={product?.condition ?? "new"}>
                  <SelectTrigger id="condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="used">Used</SelectItem>
                    <SelectItem value="refurbished">Refurbished</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="badge">Badge</Label>
                <Input
                  id="badge"
                  name="badge"
                  placeholder="e.g. Bestseller, Neu, Angebot (optional)"
                  defaultValue={product?.badge ?? ""}
                />
                <FieldError name="badge" errors={fieldErrors} />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_featured"
                  name="is_featured"
                  defaultChecked={product?.is_featured ?? false}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <Label htmlFor="is_featured" className="cursor-pointer">
                  Featured (show in storefront highlights)
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category_id">Category</Label>
                <Select name="category_id" defaultValue={product?.category_id ?? ""}>
                  <SelectTrigger id="category_id">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stock_quantity">Stock Quantity</Label>
                <Input
                  id="stock_quantity"
                  name="stock_quantity"
                  type="number"
                  defaultValue={product?.stock_quantity ?? 0}
                />
                <FieldError name="stock_quantity" errors={fieldErrors} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} />
                <FieldError name="sku" errors={fieldErrors} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Google Merchant</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="brand">Brand</Label>
                <Input id="brand" name="brand" defaultValue={product?.brand ?? ""} />
                <FieldError name="brand" errors={fieldErrors} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mpn">MPN</Label>
                <Input id="mpn" name="mpn" defaultValue={product?.mpn ?? ""} />
                <FieldError name="mpn" errors={fieldErrors} />
                <p className="text-xs text-muted-foreground">
                  Manufacturer Part Number. Needs Brand filled in too to
                  count as a valid identifier with Google.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
