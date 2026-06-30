import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateText } from "@/lib/translate";
import type { Store } from "@/lib/types";

type EntityType = "product" | "category";

type SyncParams = {
  store: Store;
  entityType: EntityType;
  entityId: string;
  fields: Record<string, string | null | undefined>;
  categoryPath?: string | null;
};

/**
 * Translates the given fields into every locale the store has enabled
 * (beyond its own source language) via DeepSeek, and upserts successful
 * results into the translations table.
 *
 * Best-effort and fire-and-forget from the caller's perspective: a failed
 * translation simply doesn't produce a row (so the storefront falls back to
 * the source-language value) rather than overwriting a previously-good
 * translation with an error state — a transient DeepSeek API hiccup must
 * never destroy an existing good translation. This function never throws;
 * a product/category save must never fail because translation had a
 * problem.
 */
export async function syncTranslations({
  store,
  entityType,
  entityId,
  fields,
  categoryPath,
}: SyncParams): Promise<void> {
  const sourceLocale = store.google_content_language || "en";
  const targetLocales = (store.enabled_locales ?? []).filter((locale) => locale !== sourceLocale);
  if (targetLocales.length === 0) return;

  const fieldEntries = Object.entries(fields).filter(
    (entry): entry is [string, string] => Boolean(entry[1]?.trim())
  );
  if (fieldEntries.length === 0) return;

  const jobs = targetLocales.flatMap((locale) =>
    fieldEntries.map(async ([fieldName, value]) => {
      try {
        const translated = await translateText({
          text: value,
          sourceLocale,
          targetLocale: locale,
          fieldRole: fieldName,
          categoryPath,
        });

        await supabaseAdmin.from("translations").upsert(
          {
            store_id: store.id,
            entity_type: entityType,
            entity_id: entityId,
            field_name: fieldName,
            locale,
            value: translated,
            translator: "ai",
          },
          { onConflict: "entity_type,entity_id,field_name,locale" }
        );
      } catch {
        // Best-effort — see function doc comment. Leaves any prior
        // successful translation for this field/locale untouched.
      }
    })
  );

  await Promise.all(jobs);
}
