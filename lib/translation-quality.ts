/** Conservative check: official model names may legitimately stay unchanged. */
export function isUntranslatedCopy(
  source: string,
  translated: string,
  sourceLocale: string,
  targetLocale: string,
  field: string
): boolean {
  if (sourceLocale.toLowerCase().split("-")[0] === targetLocale.toLowerCase().split("-")[0]) return false;
  const plain = (text: string) => text.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|quot|#39);/gi, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
  const original = plain(source);
  if (!original || original !== plain(translated)) return false;
  const prose = ["description", "short_description", "meta_description", "google_description"].includes(field);
  if (prose && original.split(/\s+/).length >= 12) return true;
  if (sourceLocale.toLowerCase().split("-")[0] !== "en") return false;
  if (!["name", "meta_title", "google_title"].includes(field) && !prose) return false;
  return /\b(blue dial|green dial|black dial|white dial|stainless steel|yellow gold|rose gold|box and papers|full set|leather strap|unworn|wristwatch|watch with|comes with|made of)\b/i.test(original)
    || (prose && /\b(the|this|with|features|includes|designed|crafted)\b/i.test(original));
}

export type ExistingTranslation = { value: string; translator: string };

/** Missing/blank/failed copies are retried; changed AI fields are refreshed. */
export function shouldTranslateField({ existing, source, sourceLocale, targetLocale, field, onlyMissing, sourceChanged }: {
  existing?: ExistingTranslation;
  source: string;
  sourceLocale: string;
  targetLocale: string;
  field: string;
  onlyMissing: boolean;
  sourceChanged: boolean;
}): boolean {
  if (!source.trim() || existing?.translator === "human") return false;
  return !onlyMissing || sourceChanged || !existing?.value.trim()
    || isUntranslatedCopy(source, existing.value, sourceLocale, targetLocale, field);
}
