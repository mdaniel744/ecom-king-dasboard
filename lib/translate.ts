import "server-only";

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
};

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
}: TranslateParams): Promise<string> {
  if (!text.trim()) return "";

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new TranslationError("DEEPSEEK_API_KEY is not set.");
  }

  const systemPrompt = [
    `You are a professional e-commerce translator.`,
    `Translate the user's text from "${sourceLocale}" to "${targetLocale}".`,
    `This text is a "${fieldRole}" on an online store product/category page.`,
    categoryPath ? `It belongs to the category "${categoryPath}" — use terminology appropriate to that industry.` : null,
    `Keep tone and length appropriate for e-commerce. Preserve any numbers, units, and proper nouns exactly.`,
    `Return ONLY the translated text — no quotes, no explanation, no original text.`,
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
