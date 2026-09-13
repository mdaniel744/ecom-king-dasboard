import type { Store } from "@/lib/types";
import { KARIV_GLAMOUR_STORE_ID } from "./tenant-ids.js";

export { KARIV_GLAMOUR_STORE_ID };
export const KARIV_TRANSLATION_PROTECTED_PRODUCT_IDS = new Set([
  "7375cbf5-5588-4ca9-bd16-baae4be6a0e5",
  "abb40274-aa40-44d7-93d3-6e93c552c51b",
]);

export const PRODUCT_CONTENT_FIELDS = [
  "name",
  "short_description",
  "description",
  "meta_title",
  "meta_description",
  "badge",
  "google_title",
  "google_description",
] as const;

export type ProductContentField = (typeof PRODUCT_CONTENT_FIELDS)[number];
export type ProductContentValues = Record<ProductContentField, string | null>;

const GERMAN_WORDS = new Set([
  "aber", "alle", "als", "auch", "auf", "aus", "bei", "das", "dem", "den", "der", "des",
  "die", "dies", "diese", "einer", "eine", "einem", "einen", "für", "hat", "ist", "mit",
  "nicht", "oder", "sich", "sie", "und", "von", "wie", "wir", "wird", "zu", "zum", "zur",
  "uhr", "uhren", "gehäuse", "armband", "zifferblatt", "zustand", "durchmesser", "jahr",
]);
const ENGLISH_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "by", "for", "from", "has", "in", "is", "it", "its",
  "of", "on", "or", "that", "the", "this", "to", "with", "watch", "watches", "case", "dial",
  "bracelet", "condition", "diameter", "year", "features", "including", "crafted", "offers",
]);

function plainText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type LanguageDetection = {
  locale: "de" | "en" | "ambiguous" | "empty";
  confidence: number;
};

/**
 * Deliberately conservative fallback for legacy imports that do not declare
 * their content language. An explicit UI/import language always wins.
 */
export function detectEnglishOrGerman(value: string | null | undefined): LanguageDetection {
  const text = plainText(value).toLocaleLowerCase();
  if (!text) return { locale: "empty", confidence: 1 };

  const words = text.match(/[\p{L}]+/gu) ?? [];
  let germanScore = (text.match(/[äöüß]/g) ?? []).length * 3;
  let englishScore = 0;
  for (const word of words) {
    if (GERMAN_WORDS.has(word)) germanScore += 1;
    if (ENGLISH_WORDS.has(word)) englishScore += 1;
  }

  const top = Math.max(germanScore, englishScore);
  const difference = Math.abs(germanScore - englishScore);
  if (top < 2 || difference < 2) return { locale: "ambiguous", confidence: 0 };
  return {
    locale: germanScore > englishScore ? "de" : "en",
    confidence: Math.min(1, difference / Math.max(3, top)),
  };
}

export function usesKarivProductLanguagePolicy(store: Pick<Store, "id">) {
  return store.id === KARIV_GLAMOUR_STORE_ID;
}

export function configuredProductContentLocales(
  store: Pick<Store, "id" | "google_content_language" | "enabled_locales">
) {
  if (!usesKarivProductLanguagePolicy(store)) return [];
  return [...new Set([store.google_content_language, ...(store.enabled_locales ?? [])])]
    .map((locale) => locale.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveIncomingProductLocale({
  store,
  declaredLocale,
  fields,
}: {
  store: Pick<Store, "id" | "google_content_language" | "enabled_locales">;
  declaredLocale?: string | null;
  fields: Partial<ProductContentValues>;
}) {
  const sourceLocale = store.google_content_language.trim().toLowerCase() || "en";
  if (!usesKarivProductLanguagePolicy(store)) return sourceLocale;

  const allowed = new Set(configuredProductContentLocales(store));
  const declared = declaredLocale?.trim().toLowerCase();
  if (declared && allowed.has(declared)) return declared;

  const combined = [fields.name, fields.short_description, fields.description]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  const detected = detectEnglishOrGerman(combined);
  return detected.locale === "de" || detected.locale === "en" ? detected.locale : sourceLocale;
}
