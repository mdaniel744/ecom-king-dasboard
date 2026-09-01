"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ImageIcon, ImagePlus, Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { updateInvoiceSettings } from "@/app/dashboard/invoices/actions";
import { uploadDashboardImage } from "@/app/dashboard/upload-image-action";
import { ActionErrorBanner } from "@/components/dashboard/action-error-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { defaultInvoiceSettings } from "@/lib/invoice-settings-defaults";
import type { InvoiceSettings, InvoiceTemplate, PaymentSettings } from "@/lib/types";

const templateOptions: Array<{
  value: InvoiceTemplate;
  label: string;
  description: string;
}> = [
  { value: "corporate", label: "Corporate", description: "Structured trade invoice with payment terms" },
  { value: "modern", label: "Modern", description: "Bold branded header and clean totals" },
  { value: "classic", label: "Classic", description: "Formal document styling with strong rules" },
  { value: "minimal", label: "Minimal", description: "Lightweight layout with more white space" },
];

function stringValue(value: string | null) {
  return value ?? "";
}

export function InvoiceSettingsForm({
  initialSettings,
  storeName,
  storeEmail,
  paymentSettings,
  isLocalDemo,
}: {
  initialSettings: InvoiceSettings;
  storeName: string;
  storeEmail: string | null;
  paymentSettings: PaymentSettings;
  isLocalDemo: boolean;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState<string | null>(
    initialSettings.logo_url ? "Current company logo" : null
  );
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  const update = <Key extends keyof InvoiceSettings>(key: Key, value: InvoiceSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const resetPreview = () => {
    setSettings(defaultInvoiceSettings(initialSettings.store_id, storeName, storeEmail));
    setLogoPreviewUrl(null);
    setLogoFileName(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
    setError(null);
  };

  const removeLogo = () => {
    update("logo_url", null);
    setLogoPreviewUrl(null);
    setLogoFileName(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const uploadLogo = async (file: File) => {
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!allowedTypes.has(file.type)) {
      toast.error("Choose a JPEG, PNG, WebP, or GIF image.");
      if (logoInputRef.current) logoInputRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Logo images can be up to 10MB.");
      if (logoInputRef.current) logoInputRef.current.value = "";
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setLogoPreviewUrl(localPreview);
    setLogoFileName(file.name);

    if (isLocalDemo) {
      toast.success("Logo selected for this local preview");
      if (logoInputRef.current) logoInputRef.current.value = "";
      return;
    }

    setIsLogoUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("folder", "invoice-logos");
      const result = await uploadDashboardImage(formData);

      if (result.url) {
        update("logo_url", result.url);
        toast.success("Company logo uploaded");
      } else {
        setLogoPreviewUrl(null);
        setLogoFileName(initialSettings.logo_url ? "Current company logo" : null);
        toast.error(result.error ?? "Logo upload failed");
      }
    } catch {
      setLogoPreviewUrl(null);
      setLogoFileName(initialSettings.logo_url ? "Current company logo" : null);
      toast.error("Logo upload failed — please try again.");
    } finally {
      setIsLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateInvoiceSettings({
        template: settings.template,
        accentColor: settings.accent_color,
        fontFamily: settings.font_family,
        logoUrl: stringValue(settings.logo_url),
        businessName: settings.business_name,
        businessAddress: stringValue(settings.business_address),
        businessEmail: stringValue(settings.business_email),
        businessPhone: stringValue(settings.business_phone),
        businessWebsite: stringValue(settings.business_website),
        companyRegistrationNumber: stringValue(settings.company_registration_number),
        vatRegistrationNumber: stringValue(settings.vat_registration_number),
        taxId: stringValue(settings.tax_id),
        accountManagerName: stringValue(settings.account_manager_name),
        accountManagerEmail: stringValue(settings.account_manager_email),
        accountManagerPhone: stringValue(settings.account_manager_phone),
        invoicePrefix: settings.invoice_prefix,
        dueDays: settings.due_days,
        paymentTerms: stringValue(settings.payment_terms),
        deliveryTerms: stringValue(settings.delivery_terms),
        depositPercentage: settings.deposit_percentage,
        commercialTerms: stringValue(settings.commercial_terms),
        autoSend: settings.auto_send,
        footerNote: stringValue(settings.footer_note),
        showLogo: settings.show_logo,
        showBillingAddress: settings.show_billing_address,
        showShippingAddress: settings.show_shipping_address,
        showTaxBreakdown: settings.show_tax_breakdown,
      });

      if (result.success) {
        toast.success("Invoice settings saved");
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
      <div className="space-y-6">
        <ActionErrorBanner message={error} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose a layout</CardTitle>
            <p className="text-sm text-muted-foreground">
              Start with a layout, then adapt its colour, type, logo, and content to each store.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {templateOptions.map((option) => {
              const selected = settings.template === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => update("template", option.value)}
                  className={`relative rounded-lg border p-4 text-left transition-colors ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  {selected && (
                    <span className="absolute right-3 top-3 rounded-full bg-primary p-0.5 text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <p className="font-medium">{option.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company identity & invoice branding</CardTitle>
            <p className="text-sm text-muted-foreground">
              Supplier identity and legal details shown in the invoice header and structured footer. These values belong only to this store.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:col-span-2">
              EU VAT invoices generally need the supplier&apos;s full legal name, registered address, and VAT identification number. Individual countries and transaction types can require additional wording or registration details.
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-business-name">Business name</Label>
              <Input
                id="invoice-business-name"
                value={settings.business_name}
                onChange={(event) => update("business_name", event.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice-logo-upload">Company logo</Label>
              <input
                ref={logoInputRef}
                id="invoice-logo-upload"
                aria-label="Upload company logo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadLogo(file);
                }}
              />
              <div className="flex flex-col gap-4 rounded-lg border border-dashed bg-muted/20 p-4 sm:flex-row sm:items-center">
                <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                  {logoPreviewUrl || settings.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoPreviewUrl || settings.logo_url || ""}
                      alt="Company logo preview"
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {logoFileName || "No logo uploaded"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Upload a PNG, JPEG, WebP, or GIF up to 10MB. Transparent PNG or WebP files work best on invoices.
                  </p>
                  {isLocalDemo && logoPreviewUrl && (
                    <p className="mt-1 text-xs text-amber-700">
                      Local preview only — live stores upload this image to tenant-scoped media storage.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isLogoUploading}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {isLogoUploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="mr-2 h-4 w-4" />
                    )}
                    {isLogoUploading ? "Uploading..." : logoPreviewUrl || settings.logo_url ? "Replace" : "Upload logo"}
                  </Button>
                  {(logoPreviewUrl || settings.logo_url) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Remove company logo"
                      onClick={removeLogo}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-accent">Brand colour</Label>
              <div className="flex gap-2">
                <Input
                  id="invoice-accent-picker"
                  aria-label="Choose brand colour"
                  type="color"
                  value={settings.accent_color}
                  onChange={(event) => update("accent_color", event.target.value.toUpperCase())}
                  className="w-14 cursor-pointer p-1"
                />
                <Input
                  id="invoice-accent"
                  value={settings.accent_color}
                  onChange={(event) => update("accent_color", event.target.value)}
                  maxLength={7}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Document typeface</Label>
              <Select
                value={settings.font_family}
                onValueChange={(value) => update("font_family", value as "sans" | "serif")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sans">Modern sans-serif</SelectItem>
                  <SelectItem value="serif">Editorial serif</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice-business-address">Business address</Label>
              <Textarea
                id="invoice-business-address"
                value={stringValue(settings.business_address)}
                onChange={(event) => update("business_address", event.target.value || null)}
                rows={3}
                maxLength={1000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-business-email">Business email</Label>
              <Input
                id="invoice-business-email"
                type="email"
                value={stringValue(settings.business_email)}
                onChange={(event) => update("business_email", event.target.value || null)}
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-business-phone">Business phone</Label>
              <Input
                id="invoice-business-phone"
                value={stringValue(settings.business_phone)}
                onChange={(event) => update("business_phone", event.target.value || null)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-business-website">Business website</Label>
              <Input
                id="invoice-business-website"
                type="url"
                placeholder="https://example.com"
                value={stringValue(settings.business_website)}
                onChange={(event) => update("business_website", event.target.value || null)}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-vat-number">VAT registration number</Label>
              <Input
                id="invoice-vat-number"
                placeholder="e.g. DE123456789"
                value={stringValue(settings.vat_registration_number)}
                onChange={(event) => update("vat_registration_number", event.target.value || null)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-company-number">Company registration number</Label>
              <Input
                id="invoice-company-number"
                placeholder="Commercial or company register number"
                value={stringValue(settings.company_registration_number)}
                onChange={(event) => update("company_registration_number", event.target.value || null)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice-tax-id">Other tax identifier</Label>
              <Input
                id="invoice-tax-id"
                placeholder="Optional national tax or fiscal number"
                value={stringValue(settings.tax_id)}
                onChange={(event) => update("tax_id", event.target.value || null)}
                maxLength={100}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Numbering & payment due</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invoice-prefix">Invoice prefix</Label>
              <Input
                id="invoice-prefix"
                value={settings.invoice_prefix}
                onChange={(event) => update("invoice_prefix", event.target.value.toUpperCase())}
                maxLength={12}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-due-days">Payment due after</Label>
              <div className="relative">
                <Input
                  id="invoice-due-days"
                  type="number"
                  min={0}
                  max={365}
                  value={settings.due_days}
                  onChange={(event) => update("due_days", Number(event.target.value) || 0)}
                  className="pr-14"
                />
                <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-muted-foreground">days</span>
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice-footer-note">Footer note</Label>
              <Textarea
                id="invoice-footer-note"
                value={stringValue(settings.footer_note)}
                onChange={(event) => update("footer_note", event.target.value || null)}
                rows={2}
                maxLength={1000}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice contact & commercial terms</CardTitle>
            <p className="text-sm text-muted-foreground">
              Add the responsible contact and the standard terms shown on customer invoices.
              Bank account details remain managed under Bureau → Payments.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invoice-manager-name">Account manager</Label>
              <Input
                id="invoice-manager-name"
                placeholder="Name shown on the invoice"
                value={stringValue(settings.account_manager_name)}
                onChange={(event) => update("account_manager_name", event.target.value || null)}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-manager-email">Account manager email</Label>
              <Input
                id="invoice-manager-email"
                type="email"
                placeholder="accounts@example.com"
                value={stringValue(settings.account_manager_email)}
                onChange={(event) => update("account_manager_email", event.target.value || null)}
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-manager-phone">Account manager phone</Label>
              <Input
                id="invoice-manager-phone"
                placeholder="+49 123 456 789"
                value={stringValue(settings.account_manager_phone)}
                onChange={(event) => update("account_manager_phone", event.target.value || null)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-deposit">Deposit required</Label>
              <div className="relative">
                <Input
                  id="invoice-deposit"
                  type="number"
                  min={0}
                  max={100}
                  value={settings.deposit_percentage}
                  onChange={(event) => update("deposit_percentage", Math.min(100, Math.max(0, Number(event.target.value) || 0)))}
                  className="pr-10"
                />
                <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice-payment-terms">Payment terms</Label>
              <Input
                id="invoice-payment-terms"
                placeholder={`Payment due within ${settings.due_days} days`}
                value={stringValue(settings.payment_terms)}
                onChange={(event) => update("payment_terms", event.target.value || null)}
                maxLength={500}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice-delivery-terms">Delivery terms or estimate</Label>
              <Input
                id="invoice-delivery-terms"
                placeholder="Estimated dispatch within 5–9 business days"
                value={stringValue(settings.delivery_terms)}
                onChange={(event) => update("delivery_terms", event.target.value || null)}
                maxLength={500}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice-commercial-terms">Customer instructions and commercial terms</Label>
              <Textarea
                id="invoice-commercial-terms"
                placeholder="Add payment instructions, acceptance conditions, or a short customer note."
                value={stringValue(settings.commercial_terms)}
                onChange={(event) => update("commercial_terms", event.target.value || null)}
                rows={4}
                maxLength={2000}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Automation & content</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              ["auto_send", "Automatically email new invoices"],
              ["show_logo", "Show business logo"],
              ["show_billing_address", "Show billing address"],
              ["show_shipping_address", "Show delivery address"],
              ["show_tax_breakdown", "Show tax breakdown"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(settings[key as keyof InvoiceSettings])}
                  onChange={(event) => update(key as keyof InvoiceSettings, event.target.checked as never)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                {label}
              </label>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={resetPreview} disabled={isPending || isLogoUploading}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset preview
          </Button>
          <Button type="button" onClick={save} disabled={isPending || isLogoUploading}>
            <Save className="mr-2 h-4 w-4" /> {isPending ? "Saving..." : "Save invoice settings"}
          </Button>
        </div>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Live invoice preview
        </p>
        <InvoicePreview
          settings={settings}
          paymentSettings={paymentSettings}
          logoPreviewUrl={logoPreviewUrl}
        />
      </div>
    </div>
  );
}

function InvoicePreview({
  settings,
  paymentSettings,
  logoPreviewUrl,
}: {
  settings: InvoiceSettings;
  paymentSettings: PaymentSettings;
  logoPreviewUrl: string | null;
}) {
  const isModern = settings.template === "modern";
  const isClassic = settings.template === "classic";
  const isCorporate = settings.template === "corporate";
  const fontFamily = settings.font_family === "serif" ? "Georgia, serif" : "Arial, sans-serif";
  const invoiceNumber = `${settings.invoice_prefix || "INV"}-2026-0042`;
  const paymentTerms = settings.payment_terms || `Payment due within ${settings.due_days} days`;
  const deliveryTerms = settings.delivery_terms || "Estimated dispatch within 5–9 business days";
  const total = 4165;
  const depositAmount = total * (settings.deposit_percentage / 100);
  const previewMoney = (value: number) =>
    new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);
  const mutedHeaderText = isModern ? "text-white/75" : "text-slate-500";
  const footerIsFilled = isCorporate;
  const footerHeading = footerIsFilled ? "text-white" : "text-slate-700";
  const footerText = footerIsFilled ? "text-white/75" : "text-slate-500";
  const logoSrc = logoPreviewUrl || settings.logo_url;

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-white text-slate-900 shadow-xl"
      style={{ fontFamily }}
    >
      <div
        className={`flex items-start justify-between gap-6 p-6 sm:p-8 ${isClassic || isCorporate ? "border-b-2" : ""}`}
        style={{
          backgroundColor: isModern ? settings.accent_color : "#ffffff",
          borderColor: isClassic || isCorporate ? settings.accent_color : undefined,
          color: isModern ? "#ffffff" : settings.accent_color,
        }}
      >
        {isCorporate ? (
          <>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em]">Invoice</p>
              <h2 className="mt-2 whitespace-nowrap text-xl font-semibold tracking-tight">{invoiceNumber}</h2>
              <p className="mt-1 whitespace-nowrap text-xs text-slate-500">Issued 01 September 2026</p>
            </div>
            <div className="text-right">
              {settings.show_logo && logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="Business logo" className="ml-auto h-12 max-w-40 object-contain object-right" />
              ) : (
                <p className="text-sm font-bold uppercase tracking-[0.16em]">{settings.business_name}</p>
              )}
              <p className="mt-2 text-xs text-slate-500">Order ORD-2026-0042 · Page 1 of 1</p>
            </div>
          </>
        ) : (
          <>
            <div>
              {settings.show_logo && logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="Business logo" className="mb-3 h-10 max-w-36 object-contain object-left" />
              ) : (
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em]">{settings.business_name}</div>
              )}
              <h2 className="text-3xl font-semibold tracking-tight">Invoice</h2>
            </div>
            <div className="text-right text-xs leading-5">
              <p className="font-semibold">{invoiceNumber}</p>
              <p className={mutedHeaderText}>Order ORD-2026-0042</p>
              <p className={mutedHeaderText}>Due in {settings.due_days} days</p>
            </div>
          </>
        )}
      </div>

      <div className="space-y-7 p-6 text-xs sm:p-8">
        {isCorporate ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              {settings.show_billing_address && (
                <AddressPreview title="Billing address" />
              )}
              {settings.show_shipping_address && (
                <AddressPreview title="Delivery address" />
              )}
            </div>
            <div className="grid gap-5 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 font-semibold uppercase tracking-wider text-slate-400">Invoice details</p>
                <PreviewDetail label="Invoice date" value="01 September 2026" />
                <PreviewDetail label="Payment terms" value={paymentTerms} />
                <PreviewDetail label="Delivery" value={deliveryTerms} />
              </div>
              <div>
                <p className="mb-2 font-semibold uppercase tracking-wider text-slate-400">Account manager</p>
                <p className="font-semibold">{settings.account_manager_name || "Add an account manager"}</p>
                {settings.account_manager_email && <p className="mt-1 text-slate-500">{settings.account_manager_email}</p>}
                {settings.account_manager_phone && <p className="text-slate-500">{settings.account_manager_phone}</p>}
              </div>
            </div>
          </>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 font-semibold uppercase tracking-wider text-slate-400">From</p>
              <p className="font-semibold">{settings.business_name}</p>
              {settings.business_address && <p className="mt-1 whitespace-pre-line leading-5 text-slate-500">{settings.business_address}</p>}
              {settings.business_email && <p className="mt-1 text-slate-500">{settings.business_email}</p>}
              {settings.business_phone && <p className="text-slate-500">{settings.business_phone}</p>}
              {settings.vat_registration_number && <p className="mt-1 text-slate-500">VAT ID: {settings.vat_registration_number}</p>}
            </div>
            {settings.show_billing_address && <AddressPreview title="Bill to" />}
          </div>
        )}

        <table className="w-full border-collapse">
          <thead>
            <tr
              style={{
                backgroundColor: isCorporate ? settings.accent_color : isModern ? `${settings.accent_color}12` : "#f8fafc",
                color: isCorporate ? "#ffffff" : undefined,
              }}
            >
              <th className="p-2.5 text-left font-semibold">Product</th>
              <th className="p-2.5 text-center font-semibold">Qty</th>
              <th className="p-2.5 text-right font-semibold">Unit price</th>
              <th className="p-2.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="p-2.5 font-medium">Premium product</td>
              <td className="p-2.5 text-center">2</td>
              <td className="p-2.5 text-right">{previewMoney(1440)}</td>
              <td className="p-2.5 text-right font-medium">{previewMoney(2880)}</td>
            </tr>
          </tbody>
        </table>

        <div className="ml-auto w-full max-w-64 space-y-2">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{previewMoney(2880)}</span></div>
          <div className="flex justify-between text-slate-500"><span>Delivery</span><span>{previewMoney(620)}</span></div>
          {settings.show_tax_breakdown && <div className="flex justify-between text-slate-500"><span>VAT 19%</span><span>{previewMoney(665)}</span></div>}
          <div className="flex justify-between border-t-2 pt-2 text-sm font-bold" style={{ borderColor: settings.accent_color, color: settings.accent_color }}>
            <span>Total</span><span>{previewMoney(total)}</span>
          </div>
        </div>

        {settings.deposit_percentage > 0 && (
          <div
            className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm font-semibold"
            style={{ borderColor: `${settings.accent_color}55`, color: settings.accent_color }}
          >
            <span>{settings.deposit_percentage}% deposit required</span>
            <span>{previewMoney(depositAmount)}</span>
          </div>
        )}

        {!isCorporate && settings.show_shipping_address && (
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="font-semibold">Delivery address</p>
            <p className="mt-1 leading-5 text-slate-500">Amaka Bello · 18 Allen Avenue, Ikeja, Lagos</p>
          </div>
        )}

        <div className="grid gap-5 border-t border-slate-200 pt-5 sm:grid-cols-2">
          <div>
            <p className="font-semibold" style={{ color: settings.accent_color }}>Payment details</p>
            {paymentSettings.bank_transfer_enabled && paymentSettings.bank_name && paymentSettings.bank_account_number ? (
              <p className="mt-2 whitespace-pre-line leading-5 text-slate-500">
                {paymentSettings.bank_name} · {paymentSettings.bank_account_name}<br />
                Account: {paymentSettings.bank_account_number} · {paymentSettings.bank_currency}
                {paymentSettings.bank_iban ? <><br />IBAN: {paymentSettings.bank_iban}</> : null}
                {paymentSettings.bank_swift_bic ? <><br />SWIFT/BIC: {paymentSettings.bank_swift_bic}</> : null}
              </p>
            ) : (
              <p className="mt-2 leading-5 text-slate-500">Bank details are managed under Bureau → Payments.</p>
            )}
          </div>
          <div>
            <p className="font-semibold" style={{ color: settings.accent_color }}>Terms & instructions</p>
            <p className="mt-2 whitespace-pre-line leading-5 text-slate-500">
              {settings.commercial_terms || paymentTerms}
            </p>
          </div>
        </div>
      </div>

      <div
        className={`border-t-2 px-6 py-5 text-[10px] leading-5 sm:px-8 ${footerText}`}
        style={{
          borderColor: settings.accent_color,
          backgroundColor: footerIsFilled ? settings.accent_color : "#ffffff",
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className={`font-semibold ${footerHeading}`}>{settings.business_name}</p>
            {settings.company_registration_number && <p>Company no. {settings.company_registration_number}</p>}
            {settings.vat_registration_number && <p>VAT ID {settings.vat_registration_number}</p>}
            {settings.tax_id && <p>Tax ID {settings.tax_id}</p>}
          </div>
          <div>
            <p className={`font-semibold ${footerHeading}`}>Registered office</p>
            <p className="whitespace-pre-line">{settings.business_address || "Add the registered company address"}</p>
          </div>
          <div>
            <p className={`font-semibold ${footerHeading}`}>Contact</p>
            {settings.business_email && <p>{settings.business_email}</p>}
            {settings.business_phone && <p>{settings.business_phone}</p>}
            {settings.business_website && <p>{settings.business_website}</p>}
          </div>
        </div>
        {settings.footer_note && (
          <p className={`mt-4 border-t pt-3 text-center ${footerIsFilled ? "border-white/20 text-white/65" : "border-slate-100 text-slate-400"}`}>
            {settings.footer_note}
          </p>
        )}
      </div>
    </div>
  );
}

function AddressPreview({ title }: { title: string }) {
  return (
    <div>
      <p className="mb-2 font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <p className="font-semibold">Amaka Bello</p>
      <p className="mt-1 leading-5 text-slate-500">
        Bello Retail Limited<br />
        18 Allen Avenue<br />
        Ikeja, Lagos
      </p>
    </div>
  );
}

function PreviewDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-5">
      <span className="font-medium text-slate-600">{label}: </span>
      <span className="text-slate-500">{value}</span>
    </div>
  );
}
