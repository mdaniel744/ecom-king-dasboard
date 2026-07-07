"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, X, ArrowLeft, Sparkles } from "lucide-react";
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
import { FieldInfo } from "@/components/ui/field-info";
import type { Category, Product } from "@/lib/types";
import type { AttributeDef } from "@/lib/attribute-defs";
import type { ActionResult } from "@/lib/action-result";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { suggestGoogleCategory } from "./suggest-category-action";
import { generateMpn } from "./generate-mpn-action";
import { generateImageAlt } from "./generate-alt-action";
import { slugify } from "@/lib/slug";

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
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugLocked, setSlugLocked] = useState(!!product?.slug);
  const [shortDescription, setShortDescription] = useState(product?.short_description ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [mpn, setMpn] = useState(product?.mpn ?? "");
  const [isGeneratingMpn, setIsGeneratingMpn] = useState(false);
  const [googleProductCategory, setGoogleProductCategory] = useState(product?.google_product_category ?? "");
  const [isSuggestingCategory, setIsSuggestingCategory] = useState(false);

  const [selectedCategoryId, setSelectedCategoryId] = useState(product?.category_id ?? "");

  const initialAttrs = product?.attributes ? Object.entries(product.attributes) : [];
  const [attrs, setAttrs] = useState<[string, string][]>(
    initialAttrs.length ? initialAttrs : [["", ""]]
  );

  const [images, setImages] = useState<string[]>(
    product?.images?.length ? product.images : [""]
  );
  const [imageAlts, setImageAlts] = useState<string[]>(
    product?.image_alts?.length ? product.image_alts : [""]
  );
  const [generatingAltIndex, setGeneratingAltIndex] = useState<number | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    const statusVal = formData.get("status") as string;
    const priceVal = (formData.get("price") as string)?.trim();
    const filledImages = images.filter((url) => url.trim());

    if (!name.trim()) {
      toast.error("Product title is required — it's how Google and your customers identify this product. Add a name before saving.");
      return;
    }

    if (statusVal === "active") {
      if (!priceVal || Number(priceVal) <= 0) {
        toast.error("Active products need a valid price — Google rejects any product without one. Add a price or save as Draft until it's ready.");
        return;
      }
      if (filledImages.length === 0) {
        toast.error("Active products need at least one image — Google won't display a product without a photo. Add an image URL or save as Draft first.");
        return;
      }
      if (!description.trim()) {
        toast.warning("No description yet — Google uses it to match your product to search queries. You can save now, but add one before syncing for best results.");
      }
    }

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

  function updateImageAlt(index: number, newValue: string) {
    setImageAlts((prev) => {
      const next = [...prev];
      next[index] = newValue;
      return next;
    });
  }

  async function handleGenerateAlt(index: number) {
    if (!name.trim()) {
      toast.error("Fill in the product title first so the AI has something to work with.");
      return;
    }
    setGeneratingAltIndex(index);
    try {
      const result = await generateImageAlt(name, description || null, brand || null, index);
      if (result.alt) {
        updateImageAlt(index, result.alt);
        toast.success("Alt text generated — review and save.");
      } else {
        toast.error(result.error ?? "Could not generate alt text.");
      }
    } catch {
      toast.error("Alt text generation failed — please try again.");
    } finally {
      setGeneratingAltIndex(null);
    }
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

  async function handleGenerateMpn() {
    if (!name) {
      toast.error("Fill in the product title first so the AI has something to work with.");
      return;
    }
    setIsGeneratingMpn(true);
    try {
      const categoryName = categories.find((c) => c.id === selectedCategoryId)?.name ?? null;
      const result = await generateMpn(name, brand || null, categoryName);
      if (result.mpn) {
        setMpn(result.mpn);
        toast.success("MPN generated — review and save.");
      } else {
        toast.error(result.error ?? "Could not generate MPN.");
      }
    } catch {
      toast.error("MPN generation failed — please try again.");
    } finally {
      setIsGeneratingMpn(false);
    }
  }

  async function handleSuggestCategory() {
    if (!name) {
      toast.error("Fill in the product title first so the AI has something to work with.");
      return;
    }
    setIsSuggestingCategory(true);
    try {
      const categoryName = categories.find((c) => c.id === selectedCategoryId)?.name ?? null;
      const result = await suggestGoogleCategory(name, description || null, null, categoryName);
      if (result.category) {
        setGoogleProductCategory(result.category);
        toast.success("Category suggested — review and adjust if needed.");
      } else {
        toast.error(result.error ?? "Could not suggest a category.");
      }
    } catch {
      toast.error("Category suggestion failed — please try again.");
    } finally {
      setIsSuggestingCategory(false);
    }
  }

  return (
    <form action={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href="/dashboard/products">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-semibold">
            {product ? "Edit Product" : "New Product"}
          </h1>
        </div>
        <Button type="submit" disabled={isPending} className="shrink-0">
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
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="name">Title *</Label>
                    <FieldInfo
                      title="Product Title"
                      description="The name of your product as it will appear on Google Shopping and your storefront. Be specific and include key details like size, color, or material. Google cuts off titles longer than 150 characters."
                    />
                  </div>
                  <AIWriteButton getValue={() => name} onResult={setName} fieldRole="name" defaultLocale={storeSourceLocale} />
                </div>
                <Input
                  id="name"
                  name="name"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugLocked) setSlug(slugify(e.target.value));
                  }}
                  placeholder="e.g. 20ft High Cube Container"
                />
                <FieldError name="name" errors={fieldErrors} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="slug">URL Slug <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                  <FieldInfo
                    title="URL Slug"
                    description="The web-address-friendly version of your product name — it becomes part of the product page URL (e.g. /products/20ft-high-cube-container). Auto-generated from the title if left blank. Use only letters, numbers, and hyphens."
                  />
                </div>
                <Input
                  id="slug"
                  name="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugLocked(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="auto-generated from title"
                />
                <FieldError name="slug" errors={fieldErrors} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="short_description">Short Description <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                    <FieldInfo
                      title="Short Description"
                      description="A brief 1–2 sentence summary shown on product cards and listings on your storefront. Not sent to Google — this is for your customers browsing your site. Keep it punchy and highlight the key benefit."
                    />
                  </div>
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
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="description">Description <span className="text-xs font-normal text-muted-foreground">(recommended for Google)</span></Label>
                    <FieldInfo
                      title="Product Description"
                      description="The full product description shown on the product detail page and sent to Google Shopping. Be detailed and accurate — include materials, dimensions, certifications, and use cases. Google uses this to match your product to search queries. Minimum 20 characters for Google approval."
                    />
                  </div>
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
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base">Attributes</CardTitle>
                <FieldInfo
                  title="Product Attributes"
                  description="Custom specifications for this product — things like Size, Material, Color, Weight, or any other property relevant to your niche. These are displayed on the product page and help customers filter and compare. Add only what applies to this specific product."
                />
              </div>
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
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base">Images</CardTitle>
                <FieldInfo
                  title="Product Images & Alt Text"
                  description="Photos of your product. The first image is the main one sent to Google as the primary image. Paste a hosted URL per box (e.g. from ImageKit). Each image has an alt text field — this is the written description Google reads when crawling your site and is one of the strongest image SEO signals. Use Generate to auto-fill it from your product details, or write your own. Tip: name your files descriptively in ImageKit before uploading (e.g. 20ft-container-front.webp) for even stronger SEO."
                />
              </div>
              <p className="text-sm text-muted-foreground">
                First image is the main one. Add alt text to every image for Google image SEO.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {images.map((url, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex gap-2">
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
                      onClick={() => {
                        setImages(images.filter((_, idx) => idx !== i));
                        setImageAlts(imageAlts.filter((_, idx) => idx !== i));
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Alt text</span>
                        <FieldInfo
                          title="Image Alt Text"
                          description="A short written description of what this image shows — Google reads it when crawling your site and uses it to rank your images in search. Write what's visible: the product name, key features, colour, and angle. E.g. 'Anthrazit grey 20ft High Cube shipping container, front view'. Avoid generic text like 'product image'. The Generate button writes this for you using your product title, description, brand, and whether this is the main or an additional image — the more complete those fields are, the more accurate the result. Since the AI cannot see the actual photo, always review what it writes and adjust to match what the image actually shows. Use Generate on every image."
                        />
                      </div>
                      <Input
                        name="image_alts"
                        value={imageAlts[i] ?? ""}
                        onChange={(e) => updateImageAlt(i, e.target.value)}
                        placeholder={i === 0 ? "e.g. Anthrazit grey 20ft container, front view" : "e.g. Container interior, side door open"}
                        className="text-sm"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleGenerateAlt(i)}
                      disabled={generatingAltIndex === i}
                      className="mt-5 h-8 gap-1.5 text-xs shrink-0"
                    >
                      <Sparkles className="h-3 w-3" />
                      {generatingAltIndex === i ? "Generating..." : "Generate"}
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setImages([...images, ""]);
                  setImageAlts([...imageAlts, ""]);
                }}
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
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="price">Price *</Label>
                    <FieldInfo
                      title="Price"
                      description="The regular selling price of the product. Required for Google Shopping. Must match the price shown on your actual product page — Google checks this and will disapprove if they don't match."
                    />
                  </div>
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
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="currency">Currency</Label>
                    <FieldInfo
                      title="Currency"
                      description="The 3-letter currency code for this product's price (e.g. EUR for Euros, USD for US Dollars, GBP for British Pounds). Must match the currency your storefront actually charges in."
                    />
                  </div>
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
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="sale_price">Sale Price <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                  <FieldInfo
                    title="Sale Price (optional)"
                    description="A discounted price shown alongside the regular price on Google Shopping — Google displays the original price with a strikethrough and highlights the saving. Must be lower than the regular price. Leave blank if the product is not currently on sale."
                  />
                </div>
                <Input
                  id="sale_price"
                  name="sale_price"
                  type="number"
                  step="0.01"
                  defaultValue={product?.sale_price ?? ""}
                  placeholder="Leave blank if not on sale"
                />
                <FieldError name="sale_price" errors={fieldErrors} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="status">Status</Label>
                  <FieldInfo
                    title="Product Status"
                    description="Draft: saved but not visible to customers or Google. Active: live on your storefront and eligible to sync to Google Shopping. Archived: taken off sale — removed from Google if previously synced."
                  />
                </div>
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
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="condition">Condition</Label>
                  <FieldInfo
                    title="Product Condition"
                    description="Required by Google Shopping. New: brand new, unused, in original packaging. Used: previously owned or used. Refurbished: professionally restored to working order. Must accurately describe the actual product — Google may disapprove if the condition doesn't match the listing."
                  />
                </div>
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
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="badge">Badge <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                  <FieldInfo
                    title="Badge (optional)"
                    description="A short promotional label shown on the product card on your storefront — e.g. 'Bestseller', 'New Arrival', 'Limited Stock'. Not sent to Google. Keep it under 20 characters so it fits neatly on the card."
                  />
                </div>
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
                  Featured
                </Label>
                <FieldInfo
                  title="Featured Product"
                  description="Marks this product to be highlighted on your storefront's homepage or featured sections. Useful for your best-sellers, new arrivals, or promotions. Has no effect on Google Shopping."
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="category_id">Category <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                  <FieldInfo
                    title="Store Category"
                    description="Your own internal category for organising products in your store. Also used to build the product type breadcrumb sent to Google (e.g. 'Containers > Open Side'). Manage your categories from the Categories page in the sidebar."
                  />
                </div>
                <Select
                  name="category_id"
                  defaultValue={product?.category_id ?? ""}
                  onValueChange={setSelectedCategoryId}
                >
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
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="stock_quantity">Stock Quantity <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                  <FieldInfo
                    title="Stock Quantity"
                    description="The number of units you have available. Used for internal inventory tracking. A product with status Active is shown as 'In Stock' on Google regardless of this number — update the status to Archived to mark it unavailable."
                  />
                </div>
                <Input
                  id="stock_quantity"
                  name="stock_quantity"
                  type="number"
                  defaultValue={product?.stock_quantity ?? 0}
                />
                <FieldError name="stock_quantity" errors={fieldErrors} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="sku">SKU <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                  <FieldInfo
                    title="SKU (Stock Keeping Unit)"
                    description="Your internal product code for inventory management — e.g. a warehouse reference or supplier code. Not shown to customers and not sent to Google. Completely optional and for your own records only."
                  />
                </div>
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
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="brand">Brand <span className="text-xs font-normal text-muted-foreground">(optional, recommended for Google)</span></Label>
                  <FieldInfo
                    title="Brand"
                    description="The manufacturer or brand name of the product. Used by Google to identify and match your product in search results. If you made the product yourself, use your company name. Required together with MPN to count as a verified product identifier."
                  />
                </div>
                <Input id="brand" name="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
                <FieldError name="brand" errors={fieldErrors} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="mpn">MPN <span className="text-xs font-normal text-muted-foreground">(optional, recommended for Google)</span></Label>
                    <FieldInfo
                      title="MPN (Manufacturer Part Number)"
                      description="A unique code identifying this exact product model — no fixed length, typically a few characters up to 70 (letters, numbers, hyphens). Google pairs Brand + MPN to match your listing to the same product sold by other sellers, grouping them in Shopping so buyers can compare price and seller. Use Generate to auto-create one — AI-generated with a unique suffix so it never clashes with another product. You can edit it at any time, but always keep it unique across your products. Needs Brand filled in too to count as a valid identifier with Google."
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateMpn}
                    disabled={isGeneratingMpn}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <Sparkles className="h-3 w-3" />
                    {isGeneratingMpn ? "Generating..." : "Generate"}
                  </Button>
                </div>
                <Input
                  id="mpn"
                  name="mpn"
                  value={mpn}
                  onChange={(e) => setMpn(e.target.value)}
                  placeholder="Auto-generate or enter manually"
                />
                <FieldError name="mpn" errors={fieldErrors} />
                <p className="text-xs text-muted-foreground">
                  Needs Brand filled in too to count as a valid identifier with Google.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="google_product_category">Google Product Category <span className="text-xs font-normal text-muted-foreground">(optional, recommended for Google)</span></Label>
                    <FieldInfo
                      title="Google Product Category"
                      description="Google's own official category path for your product, taken from their public taxonomy list. This tells Google exactly where to place your product in Shopping — wrong or missing categories reduce ad relevance and reach. Use the AI suggest button to auto-fill, or look up your category manually."
                      link={{
                        label: "Browse Google's full taxonomy list",
                        href: "https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt",
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSuggestCategory}
                    disabled={isSuggestingCategory}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <Sparkles className="h-3 w-3" />
                    {isSuggestingCategory ? "Thinking..." : "AI Suggest"}
                  </Button>
                </div>
                <Input
                  id="google_product_category"
                  name="google_product_category"
                  value={googleProductCategory}
                  onChange={(e) => setGoogleProductCategory(e.target.value)}
                  placeholder="e.g. Business & Industrial > Material Handling > Shipping Containers"
                />
                <FieldError name="google_product_category" errors={fieldErrors} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
