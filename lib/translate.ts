import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export class TranslationError extends Error {}

type TranslateParams = {
  text: string;
  sourceLocale: string;
  targetLocale: string;
  /** What kind of field this is (title, description, badge, etc.) — gives the
   * model context instead of translating a bare, ambiguous string. */
  fieldRole: string;
  /** e.g. "Containers" or "Containers > Open Side" — the store's own category
   * tree, so industry-specific terms translate correctly instead of generically. */
  categoryPath?: string | null;
  /** When provided, the store's active Glossary terms are fetched and folded
   * into the prompt, so brand/product terminology stays consistent instead
   * of being reworded differently on every translation call. Omitting this
   * (or a store with zero glossary rows) is a complete no-op — existing
   * behavior for every store without a glossary is unchanged. */
  storeId?: string;
  /** True when `text` is rich-text HTML (e.g. product description) rather
   * than a plain string — adds explicit tag-preservation instructions so
   * DeepSeek translates only the visible text and leaves markup untouched. */
  isHtml?: boolean;
};

type GlossaryRow = {
  original_term: string;
  rule_type: "preserve" | "always_translate" | "never_translate";
  translations: Record<string, string>;
};

/**
 * Builds the glossary portion of the system prompt for this store and
 * target locale. Never-translate terms are passed through verbatim in
 * every language; preserve/always-translate terms only produce an
 * instruction when this specific locale has an override defined — a term
 * missing a translation for a newly-added locale is silently skipped
 * rather than guessed at.
 */
async function buildGlossaryInstructions(storeId: string, targetLocale: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("glossary")
    .select("original_term, rule_type, translations")
    .eq("store_id", storeId)
    .eq("active", true);

  const rows = (data ?? []) as GlossaryRow[];
  if (rows.length === 0) return null;

  const lines: string[] = [];
  for (const row of rows) {
    if (row.rule_type === "never_translate") {
      lines.push(`- Keep "${row.original_term}" exactly as written — do not translate it.`);
      continue;
    }
    const override = row.translations?.[targetLocale];
    if (override) {
      lines.push(`- Always translate "${row.original_term}" as "${override}".`);
    }
  }

  if (lines.length === 0) return null;
  return `Follow these store-specific terminology rules exactly:\n${lines.join("\n")}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callDeepSeek(systemPrompt: string, text: string, apiKey: string): Promise<string> {
  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TranslationError(`DeepSeek API error (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const translated = data.choices?.[0]?.message?.content?.trim();

  if (!translated) {
    throw new TranslationError("DeepSeek returned an empty translation.");
  }

  return translated;
}

/**
 * Translates one piece of text via DeepSeek's chat completion API
 * (OpenAI-compatible), with the surrounding context (field role, category)
 * folded into the prompt — this is what makes the translation
 * context-aware instead of a bare word-for-word swap.
 *
 * Retries once after a transient network failure (observed directly during
 * testing — concurrent calls to an external API occasionally hit a DNS/
 * connection hiccup) before giving up. syncTranslations treats any
 * remaining failure as "leave it for the next save," so this retry exists
 * purely to absorb one-off blips rather than make every save wait on a
 * dead API.
 */
export async function translateText({
  text,
  sourceLocale,
  targetLocale,
  fieldRole,
  categoryPath,
  storeId,
  isHtml,
}: TranslateParams): Promise<string> {
  if (!text.trim()) return "";

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new TranslationError("DEEPSEEK_API_KEY is not set.");
  }

  const glossaryInstructions = storeId ? await buildGlossaryInstructions(storeId, targetLocale) : null;

  const systemPrompt = [
    `You are a professional e-commerce translator.`,
    `Translate the user's text from "${sourceLocale}" to "${targetLocale}".`,
    `This text is a "${fieldRole}" on an online store product/category page.`,
    categoryPath ? `It belongs to the category "${categoryPath}" — use terminology appropriate to that industry.` : null,
    `Keep tone and length appropriate for e-commerce. Preserve any numbers, units, and proper nouns exactly.`,
    glossaryInstructions,
    isHtml
      ? `This text contains HTML markup. Preserve every HTML tag, attribute, and the exact tag structure unchanged — do not add, remove, reorder, or alter any tag. Translate ONLY the human-readable text between tags. Return ONLY the resulting HTML — no markdown code fences, no explanation, no original text.`
      : `Return ONLY the translated text — no quotes, no explanation, no original text.`,
  ]
    .filter(Boolean)
    .join(" ");

  try {
    return await callDeepSeek(systemPrompt, text, apiKey);
  } catch {
    await sleep(500);
    return await callDeepSeek(systemPrompt, text, apiKey);
  }
}
