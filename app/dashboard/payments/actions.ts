"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validate } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import type { PaymentSettings } from "@/lib/types";

const optionalText = (max: number) => z.string().trim().max(max).nullable();

const paymentSettingsSchema = z.object({
  bankTransferEnabled: z.boolean(),
  bankName: optionalText(200),
  bankAccountName: optionalText(200),
  bankAccountNumber: optionalText(100),
  bankCountry: optionalText(100),
  bankCurrency: z.string().trim().min(3).max(3).regex(/^[A-Za-z]{3}$/),
  bankIban: optionalText(100),
  bankSwiftBic: optionalText(50),
  bankInstructions: optionalText(3000),
  cardEnabled: z.boolean(),
  cardProvider: z.enum(["stripe", "paystack", "flutterwave", "other"]).nullable(),
  cardCheckoutLabel: optionalText(120),
  cryptoEnabled: z.boolean(),
  cryptoAssets: z.array(z.string().trim().min(1).max(20)).max(20),
  cryptoWalletDetails: optionalText(3000),
}).superRefine((values, context) => {
  if (values.bankTransferEnabled) {
    if (!values.bankName) context.addIssue({ code: "custom", path: ["bankName"], message: "Bank name is required when bank transfer is enabled" });
    if (!values.bankAccountName) context.addIssue({ code: "custom", path: ["bankAccountName"], message: "Account name is required when bank transfer is enabled" });
    if (!values.bankAccountNumber) context.addIssue({ code: "custom", path: ["bankAccountNumber"], message: "Account number is required when bank transfer is enabled" });
  }
  if (values.cardEnabled && !values.cardProvider) {
    context.addIssue({ code: "custom", path: ["cardProvider"], message: "Select a card provider before enabling card payments" });
  }
  if (values.cryptoEnabled && values.cryptoAssets.length === 0) {
    context.addIssue({ code: "custom", path: ["cryptoAssets"], message: "Add at least one accepted crypto asset" });
  }
});

export type PaymentSettingsValues = {
  bankTransferEnabled: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankCountry: string;
  bankCurrency: string;
  bankIban: string;
  bankSwiftBic: string;
  bankInstructions: string;
  cardEnabled: boolean;
  cardProvider: string;
  cardCheckoutLabel: string;
  cryptoEnabled: boolean;
  cryptoAssets: string[];
  cryptoWalletDetails: string;
};

export async function updatePaymentSettings(
  values: PaymentSettingsValues
): Promise<ActionResult> {
  try {
    const store = await getCurrentStore();
    const nullable = (value: string) => value.trim() || null;
    const fields = validate(paymentSettingsSchema, {
      ...values,
      bankName: nullable(values.bankName),
      bankAccountName: nullable(values.bankAccountName),
      bankAccountNumber: nullable(values.bankAccountNumber),
      bankCountry: nullable(values.bankCountry),
      bankCurrency: values.bankCurrency.trim().toUpperCase(),
      bankIban: nullable(values.bankIban),
      bankSwiftBic: nullable(values.bankSwiftBic),
      bankInstructions: nullable(values.bankInstructions),
      cardProvider: nullable(values.cardProvider),
      cardCheckoutLabel: nullable(values.cardCheckoutLabel),
      cryptoAssets: values.cryptoAssets.map((asset) => asset.trim().toUpperCase()).filter(Boolean),
      cryptoWalletDetails: nullable(values.cryptoWalletDetails),
    });

    const row: Omit<PaymentSettings, "created_at" | "updated_at"> = {
      store_id: store.id,
      bank_transfer_enabled: fields.bankTransferEnabled,
      bank_name: fields.bankName,
      bank_account_name: fields.bankAccountName,
      bank_account_number: fields.bankAccountNumber,
      bank_country: fields.bankCountry,
      bank_currency: fields.bankCurrency,
      bank_iban: fields.bankIban,
      bank_swift_bic: fields.bankSwiftBic,
      bank_instructions: fields.bankInstructions,
      card_enabled: fields.cardEnabled,
      card_provider: fields.cardProvider,
      card_checkout_label: fields.cardCheckoutLabel,
      crypto_enabled: fields.cryptoEnabled,
      crypto_assets: fields.cryptoAssets,
      crypto_wallet_details: fields.cryptoWalletDetails,
    };

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("payment_settings")
      .select("store_id")
      .eq("store_id", store.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const query = existing
      ? supabaseAdmin.from("payment_settings").update(row).eq("store_id", store.id)
      : supabaseAdmin.from("payment_settings").insert(row);
    const { error } = await query;
    if (error) throw error;

    revalidatePath("/dashboard/payments");
    return ok();
  } catch (error) {
    return toActionResult(error);
  }
}
