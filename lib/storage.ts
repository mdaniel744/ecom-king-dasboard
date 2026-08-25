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

// file.type is just the browser's self-reported label for the upload — an
// attacker can send any bytes under any claimed type. These are the real
// magic-byte signatures for each allowed format, checked against the
// file's actual first few bytes so the claimed type can't be trusted alone.
const MAGIC_BYTES: [string, number[]][] = [
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/gif", [0x47, 0x49, 0x46, 0x38]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]], // "RIFF" — WEBP's marker sits at byte 8, checked separately below
];

async function detectRealImageType(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  for (const [type, sig] of MAGIC_BYTES) {
    if (sig.every((byte, i) => head[i] === byte)) {
      if (type === "image/webp") {
        const webpMarker = String.fromCharCode(head[8], head[9], head[10], head[11]);
        if (webpMarker !== "WEBP") continue;
      }
      return type;
    }
  }
  return null;
}

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
  // The claimed type above is just a label the browser sent — confirm the
  // actual file bytes really are what's claimed before trusting it any
  // further (what gets stored, and what Content-Type it's served back as).
  const realType = await detectRealImageType(file);
  if (!realType || realType !== file.type) {
    throw new ImageUploadError("This file's content doesn't match its declared image type.");
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
