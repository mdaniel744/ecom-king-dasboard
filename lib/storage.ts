import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "store-images";
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, matches the bucket's own file_size_limit
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export class ImageUploadError extends Error {}

/**
 * Uploads one image file to the shared, public-read "store-images" bucket
 * and returns its public URL — the same kind of plain URL string that used
 * to be pasted in by hand from ImageKit. Nothing downstream (products,
 * brands, categories, collections, storefronts) needs to know the image
 * came from here instead of ImageKit; it's still just a URL.
 *
 * `folder` scopes the path (e.g. `${storeId}/products`) purely for tidy
 * browsing in the Supabase dashboard — it has no access-control meaning,
 * since every object in this bucket is publicly readable regardless of path.
 */
export async function uploadImage(file: File, folder: string): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ImageUploadError(`Unsupported image type "${file.type}" — use JPEG, PNG, WebP, or GIF.`);
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new ImageUploadError(`Image is too large (max ${MAX_SIZE_BYTES / 1024 / 1024}MB).`);
  }

  const ext = EXT_BY_TYPE[file.type];
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new ImageUploadError(error.message);

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
