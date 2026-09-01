import "server-only";

import { defaultPaymentSettings } from "@/lib/payment-settings-defaults";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PaymentSettings } from "@/lib/types";

export async function getPaymentSettings(storeId: string): Promise<PaymentSettings> {
  const defaults = defaultPaymentSettings(storeId);
  const { data, error } = await supabaseAdmin
    .from("payment_settings")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();

  if (error || !data) return defaults;
  return { ...defaults, ...(data as Partial<PaymentSettings>), store_id: storeId };
}
