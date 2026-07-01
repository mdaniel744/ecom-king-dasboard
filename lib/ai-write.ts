"use server";

import { z } from "zod";
import { validate } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";

const aiWriteSchema = z.object({
  text: z.string().trim().min(1, "Enter some text first.").max(5000, "Text is too long."),
  targetLocale: z.string().trim().min(2).max(10),
  sourceLocale: z.string().trim().min(2).max(10),
  fieldRole: z.string().trim().min(1).max(50),
});

// Per-field SEO instructions — what DeepSeek optimises for beyond just translating.
const SEO_GUIDE: Record<string, string> = {
  name: "Output a product title. 50–70 characters. Include the main product type and its key attribute. Plain factual language. No ALL CAPS, no words like 'amazing', 'best', 'cheap'.",
  short_description: "Output a product card teaser. Maximum 155 characters. One or two sentences. Mention the main benefit and a search keyword naturally. Scannable.",
  description: "Output a product page description. 150–300 words. Natural prose paragraphs — no bullet points. Weave in search keywords the way a customer would actually type them. Cover what the product is, what it is used for, and why it is a good choice. Google-crawlable structure.",
  meta_title: "Output a page title tag. Maximum 60 characters. Put the primary keyword early. Descriptive and specific. No clickbait.",
  meta_description: "Output a meta description. 140–155 characters exactly. Include the primary keyword, summarise the page content, end with a gentle call to action.",
  label: "Output a product attribute display label. 2–6 words. Short, clear, customer-friendly. Capitalise correctly for the target language.",
  category_description: "Output a category landing page description. 100–200 words. Natural language. Describe what kind of products are in this category and who they are for. Include relevant search terms naturally.",
};

/**
 * Translates (or SEO-rewrites in the same language) a single piece of text
 * via DeepSeek. The prompt is tailored per field role so the output meets
 * real SEO constraints (character limits, keyword placement, prose structure).
 *
 * If sourceLocale === targetLocale, no translation happens — DeepSeek just
 * SEO-upgrades the text and returns it in the same language.
 */
export async function aiWriteField(
  text: string,
  targetLocale: string,
  sourceLocale: string,
  fieldRole: string
): Promise<ActionResult<{ text: string }>> {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("AI writing is not configured — DEEPSEEK_API_KEY is missing.");

    const fields = validate(aiWriteSchema, { text, targetLocale, sourceLocale, fieldRole });
    const seoGuide = SEO_GUIDE[fields.fieldRole] ?? "Rewrite for SEO. Clear, professional, customer-friendly.";

    const isTranslating = fields.sourceLocale !== fields.targetLocale;
    const task = isTranslating
      ? `Translate from ${fields.sourceLocale} to ${fields.targetLocale}, then: ${seoGuide}`
      : `The text is already in ${fields.targetLocale}. Do NOT translate. Instead SEO-rewrite it in the same language: ${seoGuide}`;

    const systemPrompt = [
      "You are an expert SEO copywriter specialising in e-commerce product content.",
      task,
      "Return ONLY the final text — no explanations, no labels, no quotes, no commentary.",
    ].join(" ");

    async function callDeepSeek(): Promise<string> {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: fields.text },
          ],
          temperature: 0.4,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`DeepSeek error (${res.status}): ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      const result = data.choices?.[0]?.message?.content?.trim();
      if (!result) throw new Error("DeepSeek returned an empty response.");
      return result;
    }

    // One retry on transient failure — same pattern as the translation pipeline.
    let result: string;
    try {
      result = await callDeepSeek();
    } catch {
      await new Promise((r) => setTimeout(r, 500));
      result = await callDeepSeek();
    }

    return ok({ text: result });
  } catch (err) {
    return toActionResult(err);
  }
}
