"use server";

import { getCurrentStore } from "@/lib/get-current-store";
import { uploadImage, ImageUploadError } from "@/lib/storage";

/**
 * Shared upload action for every image field across the dashboard (product
 * images, brand logos/hero, category/collection images) — one place to keep
 * validation and storage logic consistent instead of forking it per feature.
 */
export async function uploadDashboardImage(
  formData: FormData
): Promise<{ url: string | null; error?: string }> {
  try {
    const store = await getCurrentStore();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { url: null, error: "No file selected." };
    }

    const folder = (formData.get("folder") as string)?.trim() || "misc";
    const url = await uploadImage(file, `${store.id}/${folder}`);
    return { url };
  } catch (err) {
    if (err instanceof ImageUploadError) return { url: null, error: err.message };
    return { url: null, error: err instanceof Error ? err.message : "Upload failed." };
  }
}
