"use server";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { validate } from "@/lib/validation";
import { ok, toActionResult, type ActionResult } from "@/lib/action-result";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  validateProductDescription,
  type GmcDescriptionValidation,
} from "@/lib/gmc-description-policy";

const aiWriteSchema = z.object({
  text: z.string().trim().min(1, "Enter some text first.").max(5000, "Text is too long."),
  targetLocale: z.string().trim().min(2).max(10),
  sourceLocale: z.string().trim().min(2).max(10),
  fieldRole: z.string().trim().min(1).max(50),
});

// Per-field SEO instructions — what DeepSeek optimises for beyond just translating.
const SEO_GUIDE: Record<string, string> = {
  name: "Output a product title. 50–70 characters. Include the main product type and its key attribute. Plain factual language. No ALL CAPS, no words like 'amazing', 'best', 'cheap'.",
  short_description: "Output a factual product summary. Maximum 155 characters. One or two sentences covering only the supplied product type and key physical attributes.",
  description: "Output a factual product page description of up to 300 words in short, scannable paragraphs. Use only supplied specifications, materials, design, dimensions, compatibility, colour, usage instructions, and physical attributes. Omit any detail that was not provided and do not pad sparse source data with invented content.",
  meta_title: "Output a page title tag. Maximum 60 characters. Put the primary keyword early. Descriptive and specific. No clickbait.",
  meta_description: "Output a meta description. 140–155 characters exactly. Include the primary keyword, summarise the page content, end with a gentle call to action.",
  google_title: "Output a Google Shopping product title. Maximum 150 characters. Put the product type first, then the most important accurate attributes such as brand, size, colour, material, or condition. No promotional language or keyword stuffing.",
  google_description: "Output a factual Google Shopping product description under 5,000 characters. Use only supplied product attributes, materials, dimensions, compatibility, colour, usage instructions, and physical characteristics. Omit any detail that was not provided.",
  label: "Output a product attribute display label. 2–6 words. Short, clear, customer-friendly. Capitalise correctly for the target language.",
  category_description: "Output a category landing page description. 100–200 words. Natural language. Describe what kind of products are in this category and who they are for. Include relevant search terms naturally.",
};

const GMC_DESCRIPTION_ROLES = new Set(["short_description", "description", "google_description"]);

const GMC_DESCRIPTION_POLICY = [
  "Apply Google Merchant Center product-description rules with zero tolerance.",
  "Do not use promotional calls to action, pricing or discount language, guarantees, unverifiable claims, shipping claims, return-policy claims, contact details, URLs, email addresses, or store handles.",
  "Do not invent product facts or infer missing specifications.",
  "Use purely factual, professional, descriptive language based only on the supplied text.",
].join(" ");

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
): Promise<ActionResult<{ text: string; validation: GmcDescriptionValidation | null }>> {
  try {
    const { userId } = await auth();
    // This calls a paid, shared-across-every-tenant DeepSeek key -- cap
    // how often one signed-in user can click Generate/AI Suggest so a
    // spammed button (or a compromised session) can't run up the whole
    // platform's AI bill. Generous enough for normal editing (a burst of
    // several fields on one product save) without being a real workflow
    // limit for a legitimate operator.
    if (!userId || !checkRateLimit(`ai-write:${userId}`, 20, 60_000)) {
      throw new Error("Too many AI requests — please wait a moment and try again.");
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("AI writing is not configured — DEEPSEEK_API_KEY is missing.");

    const fields = validate(aiWriteSchema, { text, targetLocale, sourceLocale, fieldRole });
    const seoGuide = SEO_GUIDE[fields.fieldRole] ?? "Rewrite for SEO. Clear, professional, customer-friendly.";
    const requiresGmcDescriptionCheck = GMC_DESCRIPTION_ROLES.has(fields.fieldRole);

    const sourceIsAutomatic = fields.sourceLocale === "auto";
    const isTranslating = !sourceIsAutomatic && fields.sourceLocale !== fields.targetLocale;
    const task = sourceIsAutomatic
      ? `Detect the input language. Return the result in ${fields.targetLocale}; translate only when necessary, then: ${seoGuide}`
      : isTranslating
      ? `Translate from ${fields.sourceLocale} to ${fields.targetLocale}, then: ${seoGuide}`
      : `The text is already in ${fields.targetLocale}. Do NOT translate. Instead SEO-rewrite it in the same language: ${seoGuide}`;

    const systemPrompt = [
      "You are an expert SEO copywriter specialising in e-commerce product content.",
      task,
      requiresGmcDescriptionCheck ? GMC_DESCRIPTION_POLICY : "",
      "Return ONLY the final text — no explanations, no labels, no quotes, no commentary.",
    ].filter(Boolean).join(" ");

    async function callDeepSeek(correction?: { previousText: string; flaggedTerms: string[] }): Promise<string> {
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: fields.text },
      ];
      if (correction) {
        messages.push(
          { role: "assistant", content: correction.previousText },
          {
            role: "user",
            content: `Rewrite the description again. The previous answer violated GMC policy with these exact terms: ${correction.flaggedTerms.join(", ")}. Remove those terms and any equivalent promotional, pricing, guarantee, shipping, returns, contact, or URL wording. Keep only factual product information from the original input. Return only the corrected description.`,
          }
        );
      }

      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages,
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

    let policyValidation: GmcDescriptionValidation | null = null;
    if (requiresGmcDescriptionCheck) {
      policyValidation = validateProductDescription(result);

      if (!policyValidation.isValid) {
        try {
          result = await callDeepSeek({
            previousText: result,
            flaggedTerms: policyValidation.flaggedTerms,
          });
        } catch {
          result = policyValidation.cleanedText;
        }
        policyValidation = validateProductDescription(result);
      }

      if (!policyValidation.isValid) {
        result = policyValidation.cleanedText;
        policyValidation = validateProductDescription(result);
      }

      if (!result.trim()) {
        throw new Error(
          "The AI response contained only prohibited GMC wording. Add factual product attributes and try again."
        );
      }
    }

    return ok({ text: result, validation: policyValidation });
  } catch (err) {
    return toActionResult(err);
  }
}
