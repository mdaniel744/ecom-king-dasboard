"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import type { InvoiceSettings } from "@/lib/types";

const invoiceSettingsSchema = z.object({
  template: z.enum(["classic", "modern", "minimal", "corporate"]),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit brand colour"),
  fontFamily: z.enum(["sans", "serif"]),
  logoUrl: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().url("Enter a complete logo URL").max(1000).nullable()
  ),
  businessName: z.string().trim().min(1, "Business name is required").max(200),
  businessAddress: z.string().trim().max(1000).nullable(),
  businessEmail: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().email("Enter a valid business email").max(255).nullable()
  ),
  businessPhone: z.string().trim().max(100).nullable(),
  businessWebsite: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().url("Enter a complete website URL").max(500).nullable()
  ),
  companyRegistrationNumber: z.string().trim().max(100).nullable(),
  vatRegistrationNumber: z.string().trim().max(100).nullable(),
  taxId: z.string().trim().max(100).nullable(),
  accountManagerName: z.string().trim().max(200).nullable(),
  accountManagerEmail: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().email("Enter a valid account manager email").max(255).nullable()
  ),
  accountManagerPhone: z.string().trim().max(100).nullable(),
  invoicePrefix: z.string().trim().min(1, "Invoice prefix is required").max(12).regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers, and hyphens only"),
  dueDays: z.number().int().min(0).max(365),
  paymentTerms: z.string().trim().max(500).nullable(),
  deliveryTerms: z.string().trim().max(500).nullable(),
  depositPercentage: z.number().int().min(0).max(100),
  commercialTerms: z.string().trim().max(2000).nullable(),
  autoSend: z.boolean(),
  footerNote: z.string().trim().max(1000).nullable(),
  showLogo: z.boolean(),
  showBillingAddress: z.boolean(),
  showShippingAddress: z.boolean(),
  showTaxBreakdown: z.boolean(),
});

type InvoiceSettingsValues = {
  template: string;
  accentColor: string;
  fontFamily: string;
  logoUrl: string;
  businessName: string;
  businessAddress: string;
  businessEmail: string;
  businessPhone: string;
  businessWebsite: string;
  companyRegistrationNumber: string;
  vatRegistrationNumber: string;
  taxId: string;
  accountManagerName: string;
  accountManagerEmail: string;
  accountManagerPhone: string;
  invoicePrefix: string;
  dueDays: number;
  paymentTerms: string;
  deliveryTerms: string;
  depositPercentage: number;
  commercialTerms: string;
  autoSend: boolean;
  footerNote: string;
  showLogo: boolean;
  showBillingAddress: boolean;
  showShippingAddress: boolean;
  showTaxBreakdown: boolean;
};

export async function updateInvoiceSettings(
  values: InvoiceSettingsValues
): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const fields = validate(invoiceSettingsSchema, {
      ...values,
      logoUrl: values.logoUrl.trim() || null,
      businessAddress: values.businessAddress.trim() || null,
      businessEmail: values.businessEmail.trim() || null,
      businessPhone: values.businessPhone.trim() || null,
      businessWebsite: values.businessWebsite.trim() || null,
      companyRegistrationNumber: values.companyRegistrationNumber.trim() || null,
      vatRegistrationNumber: values.vatRegistrationNumber.trim() || null,
      taxId: values.taxId.trim() || null,
      accountManagerName: values.accountManagerName.trim() || null,
      accountManagerEmail: values.accountManagerEmail.trim() || null,
      accountManagerPhone: values.accountManagerPhone.trim() || null,
      paymentTerms: values.paymentTerms.trim() || null,
      deliveryTerms: values.deliveryTerms.trim() || null,
      commercialTerms: values.commercialTerms.trim() || null,
      footerNote: values.footerNote.trim() || null,
    });

    const row: Omit<InvoiceSettings, "created_at" | "updated_at"> = {
      store_id: store.id,
      template: fields.template,
      accent_color: fields.accentColor.toUpperCase(),
      font_family: fields.fontFamily,
      logo_url: fields.logoUrl,
      business_name: fields.businessName,
      business_address: fields.businessAddress,
      business_email: fields.businessEmail,
      business_phone: fields.businessPhone,
      business_website: fields.businessWebsite,
      company_registration_number: fields.companyRegistrationNumber,
      vat_registration_number: fields.vatRegistrationNumber,
      tax_id: fields.taxId,
      account_manager_name: fields.accountManagerName,
      account_manager_email: fields.accountManagerEmail,
      account_manager_phone: fields.accountManagerPhone,
      invoice_prefix: fields.invoicePrefix.toUpperCase(),
      due_days: fields.dueDays,
      payment_terms: fields.paymentTerms,
      delivery_terms: fields.deliveryTerms,
      deposit_percentage: fields.depositPercentage,
      commercial_terms: fields.commercialTerms,
      auto_send: fields.autoSend,
      footer_note: fields.footerNote,
      show_logo: fields.showLogo,
      show_billing_address: fields.showBillingAddress,
      show_shipping_address: fields.showShippingAddress,
      show_tax_breakdown: fields.showTaxBreakdown,
    };

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("invoice_settings")
      .select("store_id")
      .eq("store_id", store.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const query = existing
      ? supabaseAdmin.from("invoice_settings").update(row).eq("store_id", store.id)
      : supabaseAdmin.from("invoice_settings").insert(row);
    const { error } = await query;
    if (error) throw error;

    revalidatePath("/dashboard/invoices");
    revalidatePath("/dashboard/invoices/settings");
    return ok();
  } catch (error) {
    return toActionResult(error);
  }
}
