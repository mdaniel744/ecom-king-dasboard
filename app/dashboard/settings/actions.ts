"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function updateStoreSettings(formData: FormData) {
  const store = await getCurrentStore();
  const name = (formData.get("name") as string).trim();
  const domainRaw = (formData.get("domain") as string).trim();
  const domain = domainRaw.replace(/^https?:\/\//, "").replace(/\/$/, "") || null;
  const googleMerchantId = (formData.get("google_merchant_id") as string).trim() || null;
  const googleMerchantDatasourceId =
    (formData.get("google_merchant_datasource_id") as string).trim() || null;
  const googleContentLanguage =
    (formData.get("google_content_language") as string).trim() || "en";
  const googleFeedLabel = (formData.get("google_feed_label") as string).trim() || "US";

  const { error } = await supabaseAdmin
    .from("stores")
    .update({
      name,
      domain,
      google_merchant_id: googleMerchantId,
      google_merchant_datasource_id: googleMerchantDatasourceId,
      google_content_language: googleContentLanguage,
      google_feed_label: googleFeedLabel,
    })
    .eq("id", store.id);

  if (error) throw new Error(`Failed to update store settings: ${error.message}`);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
}
