"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Globe2, Loader2, Plus, ShoppingCart, Sparkles, X } from "lucide-react";
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
import { TranslationEditor } from "@/components/dashboard/translation-editor";
import { RichTextEditor } from "@/components/dashboard/rich-text-editor";
import { FieldInfo } from "@/components/ui/field-info";
import type { Brand, Category, Collection, Product, ProductFamily } from "@/lib/types";
import type { AttributeDef } from "@/lib/attribute-defs";
import type { ActionResult } from "@/lib/action-result";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import type { MarketPricingSetting } from "@/lib/merchant-locales";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { FamilyDialog } from "@/app/dashboard/product-families/family-dialog";
import { suggestGoogleCategory } from "./suggest-category-action";
import { generateMpn } from "./generate-mpn-action";
import { ProductMediaManager } from "./product-media-manager";
import { previewMarketPrices, type MarketPricePreview } from "./actions";
import { stripHtml } from "@/lib/html";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";

type Props = {
  action: (formData: FormData) => Promise<ActionResult>;
  product?: Product;
  categories: Category[];
  brands?: Brand[];
  collections?: Collection[];
  families?: ProductFamily[];
  attributeDefs: AttributeDef[];
  storeSourceLocale?: string;
  enabledLocales?: string[];
  defaultCurrency?: string;
  marketPricing?: MarketPricingSetting[];
  backHref?: string;
  successHref?: string;
  heading?: string;
};

export function ProductForm({
  action,
  product,
  categories,
  brands = [],
  collections = [],
  families = [],
  attributeDefs,
  storeSourceLocale = "en",
  enabledLocales = [],
  defaultCurrency = "USD",
  marketPricing = [],
  backHref = "/dashboard/products",
  successHref,
  heading,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [price, setPrice] = useState(product?.price?.toString() ?? "");
  const [currency, setCurrency] = useState(product?.currency ?? defaultCurrency);
  const [marketPricePreviews, setMarketPricePreviews] = useState<MarketPricePreview[]>([]);
  const [marketPriceError, setMarketPriceError] = useState<string | null>(null);
  const [isLoadingMarketPrices, setIsLoadingMarketPrices] = useState(false);

  const [isFamilyMember, setIsFamilyMember] = useState(!!product?.family_id);
  const [selectedFamilyId, setSelectedFamilyId] = useState(product?.family_id ?? "");

  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugLocked, setSlugLocked] = useState(!!product?.slug);
  const [shortDescription, setShortDescription] = useState(product?.short_description ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [metaTitle, setMetaTitle] = useState(product?.meta_title ?? "");
  const [metaDescription, setMetaDescription] = useState(product?.meta_description ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [selectedBrandId, setSelectedBrandId] = useState(product?.brand_id ?? "");
  const [selectedCollectionId, setSelectedCollectionId] = useState(product?.collection_id ?? "");
  const [mpn, setMpn] = useState(product?.mpn ?? "");
  const [isGeneratingMpn, setIsGeneratingMpn] = useState(false);
  const [googleProductCategory, setGoogleProductCategory] = useState(product?.google_product_category ?? "");
  const [googleTitle, setGoogleTitle] = useState(product?.google_title ?? "");
  const [googleDescription, setGoogleDescription] = useState(product?.google_description ?? "");
  const [isSuggestingCategory, setIsSuggestingCategory] = useState(false);

  const [selectedCategoryId, setSelectedCategoryId] = useState(product?.category_id ?? "");

  const marketPricingKey = useMemo(
    () => marketPricing.map((item) => `${item.market}:${item.currency}:${item.vatRate}`).join("|"),
    [marketPricing]
  );
  const prioritizedCurrencyOptions = useMemo(() => {
    const optionsByCode = new Map(CURRENCY_OPTIONS.map((option) => [option.value, option]));
    const preferredCodes = [
      ...marketPricing.map((item) => item.currency.toUpperCase()),
      product?.currency?.toUpperCase(),
      defaultCurrency.toUpperCase(),
    ].filter((code): code is string => Boolean(code));
    const uniquePreferredCodes = [...new Set(preferredCodes)];

    return [
      ...uniquePreferredCodes.map(
        (code) => optionsByCode.get(code) ?? { value: code, label: code }
      ),
      ...CURRENCY_OPTIONS.filter((option) => !uniquePreferredCodes.includes(option.value)),
    ];
  }, [defaultCurrency, marketPricing, product?.currency]);
  const shouldPreviewMarketPrices = marketPricing.some(
    (item) => item.currency !== currency || item.vatRate > 0
  );

  useEffect(() => {
    const numericPrice = Number(price);
    if (!shouldPreviewMarketPrices || !Number.isFinite(numericPrice) || numericPrice <= 0) {
      setMarketPricePreviews([]);
      setMarketPriceError(null);
      setIsLoadingMarketPrices(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setIsLoadingMarketPrices(true);
      setMarketPriceError(null);
      const result = await previewMarketPrices({ price: numericPrice, currency });
      if (cancelled) return;

      if (result.success) {
        setMarketPricePreviews(result.data);
      } else {
        setMarketPricePreviews([]);
        setMarketPriceError(result.error);
      }
      setIsLoadingMarketPrices(false);
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [currency, marketPricingKey, price, shouldPreviewMarketPrices]);

  const initialAttrs = product?.attributes ? Object.entries(product.attributes) : [];
  const [attrs, setAttrs] = useState<[string, string][]>(
    initialAttrs.length ? initialAttrs : [["", ""]]
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    const statusVal = formData.get("status") as string;
    const returnFamilyId = (formData.get("family_id") as string)?.trim();
    const priceVal = (formData.get("price") as string)?.trim();
    const filledImages = (formData.getAll("images") as string[]).filter((url) => url.trim());

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
        toast.error("Active products need at least one image — Google won't display a product without a photo. Upload an image or save as Draft first.");
        return;
      }
      if (!stripHtml(description).trim()) {
        toast.warning("No description yet — Google uses it to match your product to search queries. You can save now, but add one before syncing for best results.");
      }
    }

    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        toast.success(product ? "Product updated" : "Product created");
        router.push(
          successHref ||
            (returnFamilyId
              ? `/dashboard/product-families/${returnFamilyId}`
              : "/dashboard/products")
        );
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors);
        toast.error(result.error);
      }
    });
  }

  // AI Write returns plain text; the description field is rich-text HTML,
  // so wrap each paragraph in <p> (escaping first) rather than dropping raw
  // plain text into the editor as one unbroken line.
  function plainTextToParagraphHtml(text: string): string {
    const escape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escape(p)}</p>`)
      .join("");
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
      const result = await suggestGoogleCategory(name, description || null, brand || null, categoryName);
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
            <Link href={backHref} aria-label="Close product editor">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-semibold">
            {heading || (product ? "Edit Product" : "New Product")}
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
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm">Product Type</Label>
                  <FieldInfo
                    title="Product Type"
                    description="Standalone: a normal, independent product — what most products should be. Part of a Family: this product is one size/colour/condition of a group of near-identical products (e.g. this specific '20ft, Used, Blue' container belongs to the '20ft Standard Container' family). Either way, this product keeps its own price, SKU, images, and its own real page — a family only adds a grouping relationship for the storefront's variant picker and Google Merchant's item grouping, it never merges data between products."
                  />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="product_type_choice"
                      checked={!isFamilyMember}
                      onChange={() => {
                        setIsFamilyMember(false);
                        setSelectedFamilyId("");
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                    Standalone Product
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="product_type_choice"
                      checked={isFamilyMember}
                      onChange={() => setIsFamilyMember(true)}
                      className="h-4 w-4 accent-primary"
                    />
                    Part of a Family
                  </label>
                </div>

                {isFamilyMember && (
                  <div className="flex items-center gap-2 pt-1">
                    {families.length > 0 ? (
                      <Select name="family_id" value={selectedFamilyId} onValueChange={setSelectedFamilyId}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Choose a family..." />
                        </SelectTrigger>
                        <SelectContent>
                          {families.map((family) => (
                            <SelectItem key={family.id} value={family.id}>
                              {family.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <>
                        <input type="hidden" name="family_id" value="" />
                        <p className="flex-1 text-sm text-muted-foreground">No families yet — create the first one.</p>
                      </>
                    )}
                    <FamilyDialog categories={categories} storeSourceLocale={storeSourceLocale} onSuccess={() => router.refresh()} />
                  </div>
                )}
              </div>

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
                  <AIWriteButton
                    getValue={() => stripHtml(description)}
                    onResult={(text) => setDescription(plainTextToParagraphHtml(text))}
                    fieldRole="description"
                    defaultLocale={storeSourceLocale}
                  />
                </div>
                <input type="hidden" name="description" value={description} />
                <RichTextEditor value={description} onChange={setDescription} placeholder="Full product description..." />
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
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                  <FieldError name="price" errors={fieldErrors} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="currency">Currency</Label>
                    <FieldInfo
                      title="Currency"
                      description="The base currency used when entering this product's price. New products automatically start with the first currency configured under Delivery Markets, so you normally do not need to search this list. Other selected market currencies are calculated automatically below using the latest available reference rate and that market's VAT."
                    />
                  </div>
                  <Select name="currency" value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {prioritizedCurrencyOptions.map((option) => (
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

              {shouldPreviewMarketPrices && (
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary">
                        <Globe2 className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">Automatic market prices</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Latest available reference-rate conversion, followed by each market&apos;s
                          configured VAT.
                        </p>
                      </div>
                    </div>
                    {isLoadingMarketPrices && (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  {marketPriceError ? (
                    <p className="mt-3 text-xs text-destructive">{marketPriceError}</p>
                  ) : marketPricePreviews.length > 0 ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {marketPricePreviews.map((preview) => (
                        <div
                          key={preview.market}
                          className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
                        >
                          <div>
                            <p className="text-xs font-semibold">{preview.market}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {preview.vatRate > 0
                                ? `${preview.vatRate}% VAT included`
                                : "No VAT added"}
                            </p>
                          </div>
                          <p className="text-sm font-semibold">
                            {new Intl.NumberFormat("en", {
                              style: "currency",
                              currency: preview.currency,
                            }).format(preview.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Enter a price to preview the customer price in every selected market.
                    </p>
                  )}
                </div>
              )}

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

              <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
                <div>
                  <p className="text-sm font-medium">Brand &amp; Collection</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Group this product under its brand and a related collection.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="brand_id">Brand <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                    <FieldInfo
                      title="Product Brand"
                      description="Choose a structured brand for dashboard organization. Selecting one also fills the Google Merchant Brand field, and makes that brand's collections available below."
                    />
                  </div>
                  <Select
                    name="brand_id"
                    value={selectedBrandId}
                    onValueChange={(value) => {
                      setSelectedBrandId(value);
                      setSelectedCollectionId("");
                      const match = brands.find((entry) => entry.id === value);
                      if (match) setBrand(match.name);
                    }}
                  >
                    <SelectTrigger id="brand_id">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.length > 0 ? (
                        brands.map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            {entry.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-brands-available" disabled>
                          No brands created yet
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="collection_id">Collection <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                  <Select
                    name="collection_id"
                    value={selectedCollectionId}
                    onValueChange={setSelectedCollectionId}
                    disabled={!selectedBrandId}
                  >
                    <SelectTrigger id="collection_id">
                      <SelectValue placeholder={selectedBrandId ? "None" : "Select a brand first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {collections.filter((collection) => collection.brand_id === selectedBrandId).length > 0 ? (
                        collections
                          .filter((collection) => collection.brand_id === selectedBrandId)
                          .map((collection) => (
                          <SelectItem key={collection.id} value={collection.id}>
                            {collection.name}
                          </SelectItem>
                          ))
                      ) : (
                        <SelectItem value="no-collections-available" disabled>
                          {selectedBrandId ? "No collections for this brand" : "Select a brand first"}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
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

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="reference_number">Reference Number <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                  <FieldInfo
                    title="Reference Number"
                    description="The manufacturer's own public reference/model number for this exact item (e.g. a watch reference number) — shown to customers and searchable, unlike SKU which is internal-only. Leave blank if your niche doesn't use these."
                  />
                </div>
                <Input id="reference_number" name="reference_number" defaultValue={product?.reference_number ?? ""} />
                <FieldError name="reference_number" errors={fieldErrors} />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-6 py-5 text-left [&::-webkit-details-marker]:hidden">
                <span className="rounded-lg bg-primary/10 p-2 text-primary">
                  <ShoppingCart className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Google Merchant</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Product data is used automatically · open for identifiers and optional overrides
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <CardContent className="space-y-4 border-t pt-5">
                <div className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                  Google Merchant automatically receives this product&apos;s title, description, price,
                  currency, images, availability, condition, Brand, Category, and family grouping.
                  Use the fields below only for identifiers, taxonomy suggestions, or a deliberate
                  Google-specific title or description.
                </div>
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

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="google_title">Google Title Override <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                    <FieldInfo
                      title="Google Title Override"
                      description="Sent to Google instead of the main Title above, if filled in. Leave blank to let the Merchant integration use the main product title automatically."
                    />
                  </div>
                  <AIWriteButton
                    getValue={() => googleTitle || name}
                    onResult={(value) => setGoogleTitle(value.slice(0, 150))}
                    fieldRole="google_title"
                    defaultLocale={storeSourceLocale}
                  />
                </div>
                <Input
                  id="google_title"
                  name="google_title"
                  maxLength={150}
                  value={googleTitle}
                  onChange={(event) => setGoogleTitle(event.target.value)}
                  placeholder="Leave blank to use Title automatically"
                />
                <FieldError name="google_title" errors={fieldErrors} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="google_description">Google Description Override <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                    <FieldInfo
                      title="Google Description Override"
                      description="Sent to Google instead of the main Description above, if filled in. Leave blank to let the Merchant integration use the main product description automatically."
                    />
                  </div>
                  <AIWriteButton
                    getValue={() => googleDescription || stripHtml(description) || shortDescription}
                    onResult={(value) => setGoogleDescription(value.slice(0, 5000))}
                    fieldRole="google_description"
                    defaultLocale={storeSourceLocale}
                  />
                </div>
                <Textarea
                  id="google_description"
                  name="google_description"
                  rows={3}
                  maxLength={5000}
                  value={googleDescription}
                  onChange={(event) => setGoogleDescription(event.target.value)}
                  placeholder="Leave blank to use Description automatically"
                />
                <FieldError name="google_description" errors={fieldErrors} />
              </div>
              </CardContent>
            </details>
          </Card>
        </div>
      </div>

      <ProductMediaManager
        initialItems={(product?.images ?? []).map((url, index) => ({
          id: `existing-${index}`,
          url,
          title: product?.image_titles?.[index] ?? "",
          alt: product?.image_alts?.[index] ?? "",
          description: product?.image_descriptions?.[index] ?? "",
        }))}
        productName={name}
        productDescription={description}
        brand={brand}
      />

      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">Search Engine Listing</CardTitle>
            <FieldInfo
              title="Product SEO metadata"
              description="The meta title and meta description help search engines understand this individual product page and often become the headline and summary shown in search results. Keep every product's metadata unique and closely aligned with the page content."
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Create the title and description customers may see when this product appears in search.
          </p>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <div className="space-y-5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="meta_title">SEO Meta Title</Label>
                <AIWriteButton
                  getValue={() => metaTitle || name}
                  onResult={(value) => setMetaTitle(value.slice(0, 200))}
                  fieldRole="meta_title"
                  defaultLocale={storeSourceLocale}
                />
              </div>
              <Input
                id="meta_title"
                name="meta_title"
                maxLength={200}
                value={metaTitle}
                onChange={(event) => setMetaTitle(event.target.value)}
                placeholder={name || "Concise product title for search results"}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Aim for a clear, unique title of roughly 50–60 characters.</span>
                <span className={cn(metaTitle.length > 60 && "text-amber-600")}>
                  {metaTitle.length}/60 recommended
                </span>
              </div>
              <FieldError name="meta_title" errors={fieldErrors} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="meta_description">SEO Meta Description</Label>
                <AIWriteButton
                  getValue={() => metaDescription || shortDescription || stripHtml(description)}
                  onResult={(value) => setMetaDescription(value.slice(0, 500))}
                  fieldRole="meta_description"
                  defaultLocale={storeSourceLocale}
                />
              </div>
              <Textarea
                id="meta_description"
                name="meta_description"
                rows={4}
                maxLength={500}
                value={metaDescription}
                onChange={(event) => setMetaDescription(event.target.value)}
                placeholder="Summarize this product's main benefit and distinguishing details"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Aim for a useful summary of roughly 140–160 characters.</span>
                <span className={cn(metaDescription.length > 160 && "text-amber-600")}>
                  {metaDescription.length}/160 recommended
                </span>
              </div>
              <FieldError name="meta_description" errors={fieldErrors} />
            </div>

          </div>

          <div className="rounded-xl border bg-muted/20 p-5 lg:self-start">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Search preview
            </p>
            <div className="mt-4 rounded-lg border bg-background p-4 shadow-sm">
              <p className="truncate text-sm text-emerald-700">
                example-store.com/products/{slug || "product-url"}
              </p>
              <p className="mt-1 line-clamp-1 text-xl text-blue-700">
                {metaTitle || name || "Your product SEO title"}
              </p>
              <p className="mt-1 line-clamp-3 text-sm leading-5 text-muted-foreground">
                {metaDescription ||
                  shortDescription ||
                  "Your product meta description will preview here as you write it."}
              </p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Search engines may adjust the final wording depending on the customer&apos;s query.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4">
        <TranslationEditor
          entityType="product"
          entityId={product?.id}
          enabledLocales={enabledLocales}
          fields={[
            { name: "name", label: "Title" },
            { name: "short_description", label: "Short Description" },
            { name: "description", label: "Description", multiline: true },
            { name: "meta_title", label: "SEO Meta Title" },
            { name: "meta_description", label: "SEO Meta Description", multiline: true },
          ]}
        />
      </div>
    </form>
  );
}
