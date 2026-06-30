import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateText } from "@/lib/translate";
import type { Store } from "@/lib/types";

type EntityType = "product" | "category" | "attribute_name" | "attribute_value";

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
 * Best-effort — a failed translation doesn't produce a row (storefront
 * falls back to source-language value) rather than overwriting a good
 * existing translation. Never throws; a product/category/attribute save
 * must never fail because translation had a problem.
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

  for (const locale of targetLocales) {
    // Translate the attribute name
    jobs.push(
      (async () => {
        try {
          const translated = await translateText({
            text: attributeName,
            sourceLocale,
            targetLocale: locale,
            fieldRole: "product attribute name",
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

    // Translate each value with the attribute name as context
    for (const av of values) {
      jobs.push(
        (async () => {
          try {
            const translated = await translateText({
              text: av.value,
              sourceLocale,
              targetLocale: locale,
              fieldRole: "product attribute value",
              categoryPath: attributeName,
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
