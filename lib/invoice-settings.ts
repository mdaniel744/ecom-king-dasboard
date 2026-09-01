import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { defaultInvoiceSettings } from "@/lib/invoice-settings-defaults";
import type { InvoiceSettings, Store } from "@/lib/types";

export async function getInvoiceSettings(
  store: Pick<Store, "id" | "name" | "notification_email">
): Promise<InvoiceSettings> {
  const defaults = defaultInvoiceSettings(store.id, store.name, store.notification_email);
  const { data, error } = await supabaseAdmin
    .from("invoice_settings")
    .select("*")
    .eq("store_id", store.id)
    .maybeSingle();

  // Stores that have not run the optional invoice migration yet should still
  // be able to open orders and send the existing default invoice.
  if (error || !data) return defaults;

  return { ...defaults, ...(data as Partial<InvoiceSettings>), store_id: store.id };
}
