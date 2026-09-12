import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateText } from "@/lib/translate";
import { slugify } from "@/lib/slug";
import type { Store } from "@/lib/types";

type EntityType = "product" | "category" | "product_family" | "attribute_name" | "attribute_value" | "brand" | "collection" | "guide" | "faq" | "legal_page" | "website_string";

type SyncParams = {
  store: Store;
  entityType: EntityType;
  entityId: string;
  fields: Record<string, string | null | undefined>;
  categoryPath?: string | null;
  /** Names of fields (e.g. "description") that hold rich-text HTML rather
   * than plain strings — translated with tag-preservation instructions
   * instead of the default plain-text prompt. */
  htmlFields?: string[];
  /** Preserve existing AI rows too. Used by imports/retries so a large batch
   * only fills gaps instead of paying to regenerate completed work. */
  onlyMissing?: boolean;
};

export type TranslationSyncSummary = {
  attempted: number;
  succeeded: number;
  skipped: number;
  failures: Array<{ locale: string; fieldName: string; message: string }>;
};

const TRANSLATION_CONCURRENCY = 3;

async function runBounded<T>(jobs: Array<() => Promise<T>>, concurrency = TRANSLATION_CONCURRENCY) {
  const results: T[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await jobs[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  return results;
}

/**
 * Returns the set of "locale:field_name" keys that a human has manually
 * corrected for this entity. AI translation must never overwrite these —
 * once a human fixes a translation, it stays exactly as they left it until
 * they explicitly ask for it to be re-translated (see
 * app/dashboard/translations/actions.ts for that manual-reset path).
 */
async function getHumanLockedKeys(
  storeId: string,
  entityType: EntityType,
  entityId: string
): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("translations")
    .select("locale, field_name")
    .eq("store_id", storeId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("translator", "human");

  return new Set((data ?? []).map((row) => `${row.locale}:${row.field_name}`));
}

/**
 * Translates the given fields into every locale the store has enabled
 * (beyond its own source language) via DeepSeek, and upserts successful
 * results into the translations table.
 *
 * Best-effort — a failed translation doesn't produce a row (storefront
 * falls back to source-language value) rather than overwriting a good
 * existing translation. Never throws; a product/category/attribute save
 * must never fail because translation had a problem.
 *
 * Skips any locale/field a human has already manually corrected — see
 * getHumanLockedKeys.
 */
export async function syncTranslations({
  store,
  entityType,
  entityId,
  fields,
  categoryPath,
  htmlFields = [],
  onlyMissing = false,
}: SyncParams): Promise<TranslationSyncSummary> {
  const summary: TranslationSyncSummary = { attempted: 0, succeeded: 0, skipped: 0, failures: [] };
  const sourceLocale = store.google_content_language || "en";
  const targetLocales = (store.enabled_locales ?? []).filter((locale) => locale !== sourceLocale);
  if (targetLocales.length === 0) return summary;

  const fieldEntries = Object.entries(fields).filter(
    (entry): entry is [string, string] => Boolean(entry[1]?.trim())
  );
  if (fieldEntries.length === 0) return summary;

  const lockedKeys = await getHumanLockedKeys(store.id, entityType, entityId);
  const existingKeys = new Set<string>();
  if (onlyMissing) {
    const { data } = await supabaseAdmin
      .from("translations")
      .select("locale, field_name")
      .eq("store_id", store.id)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);
    for (const row of data ?? []) existingKeys.add(`${row.locale}:${row.field_name}`);
  }

  const jobs = targetLocales.flatMap((locale) =>
    fieldEntries
      .filter(([fieldName]) => {
        const key = `${locale}:${fieldName}`;
        const skip = lockedKeys.has(key) || (onlyMissing && existingKeys.has(key));
        if (skip) summary.skipped += 1;
        return !skip;
      })
      .map(([fieldName, value]) => async () => {
        summary.attempted += 1;
        try {
          const translated = await translateText({
            text: value,
            sourceLocale,
            targetLocale: locale,
            fieldRole: fieldName,
            categoryPath,
            storeId: store.id,
            isHtml: htmlFields.includes(fieldName),
          });

          const { error } = await supabaseAdmin.from("translations").upsert(
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
          if (error) throw error;
          summary.succeeded += 1;

          // Some real storefronts (STF, confirmed live) translate the
          // product URL slug itself per language, not just the visible
          // name — a plain word-translation cache doesn't cover that.
          // Deriving it from the name we just translated (rather than a
          // separate DeepSeek call) keeps it deterministic and in sync
          // with that same translation, and reuses the exact slugify()
          // the source-language slug was generated with.
          if (entityType === "product" && fieldName === "name" && !lockedKeys.has(`${locale}:slug`)) {
            try {
              const { error: slugError } = await supabaseAdmin.from("translations").upsert(
                {
                  store_id: store.id,
                  entity_type: entityType,
                  entity_id: entityId,
                  field_name: "slug",
                  locale,
                  value: slugify(translated),
                  translator: "ai",
                },
                { onConflict: "entity_type,entity_id,field_name,locale" }
              );
              if (slugError) throw slugError;
            } catch {
              // best-effort, same rationale as below
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          summary.failures.push({ locale, fieldName, message });
          console.error(`Translation failed for ${entityType}/${entityId} ${locale}:${fieldName}: ${message}`);
        }
      })
  );

  await runBounded(jobs);
  return summary;
}

/**
 * Translates an attribute name (e.g. "Farbe", "Größe") and each of its
 * values (e.g. "Blau", "10ft") into all enabled locales for the store.
 *
 * The attribute name gets its own translation row under entity_type =
 * "attribute_name" and entity_id = the attribute's own id. Each value
 * gets entity_type = "attribute_value" and entity_id = that value row's id.
 *
 * Storefronts display translated attribute names and values by looking
 * these up separately — they don't need to re-parse the product's
 * attributes JSONB, just look up the translation for each key/value id.
 */
export async function syncAttributeTranslations(
  store: Store,
  attributeId: string,
  attributeName: string,
  values: { id: string; value: string }[]
): Promise<void> {
  const sourceLocale = store.google_content_language || "en";
  const targetLocales = (store.enabled_locales ?? []).filter((l) => l !== sourceLocale);
  if (targetLocales.length === 0) return;

  const jobs: Promise<void>[] = [];
  const nameLockedKeys = await getHumanLockedKeys(store.id, "attribute_name", attributeId);

  for (const locale of targetLocales) {
    // Translate the attribute name, unless a human already corrected it
    if (!nameLockedKeys.has(`${locale}:name`)) {
      jobs.push(
        (async () => {
          try {
            const translated = await translateText({
              text: attributeName,
              sourceLocale,
              targetLocale: locale,
              fieldRole: "product attribute name",
              storeId: store.id,
            });
            await supabaseAdmin.from("translations").upsert(
              {
                store_id: store.id,
                entity_type: "attribute_name",
                entity_id: attributeId,
                field_name: "name",
                locale,
                value: translated,
                translator: "ai",
              },
              { onConflict: "entity_type,entity_id,field_name,locale" }
            );
          } catch {
            // best-effort
          }
        })()
      );
    }

    // Translate each value with the attribute name as context, unless a
    // human already corrected that specific value/locale
    for (const av of values) {
      jobs.push(
        (async () => {
          const valueLockedKeys = await getHumanLockedKeys(store.id, "attribute_value", av.id);
          if (valueLockedKeys.has(`${locale}:value`)) return;
          try {
            const translated = await translateText({
              text: av.value,
              sourceLocale,
              targetLocale: locale,
              fieldRole: "product attribute value",
              categoryPath: attributeName,
              storeId: store.id,
            });
            await supabaseAdmin.from("translations").upsert(
              {
                store_id: store.id,
                entity_type: "attribute_value",
                entity_id: av.id,
                field_name: "value",
                locale,
                value: translated,
                translator: "ai",
              },
              { onConflict: "entity_type,entity_id,field_name,locale" }
            );
          } catch {
            // best-effort
          }
        })()
      );
    }
  }

  await Promise.all(jobs);
}
