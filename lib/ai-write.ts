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
  name: "Output only a clean product title using this order where the facts are supplied: Brand + Model or Product Type + Key Attribute, Colour, or Size. Aim for 50–70 characters. Use plain factual language with no ALL CAPS, filler adjectives, promotional wording, or unsupported keywords.",
  short_description: "Output a factual product summary of no more than 155 characters. Use one or two sentences covering only the supplied product type, intended use, and most important physical attributes. Do not use promotional language.",
  description: [
    "Output a search-optimised product description in plain text, normally 150–250 words when the supplied facts can support that length.",
    "In the first 50 words, naturally state the primary product entity, brand or model when supplied, core material or construction when supplied, intended user or use case when supplied, and the most important factual differentiator.",
    "Opening: write 2–3 concise sentences defining exactly what the item is, who or what it is intended for, its functional purpose, and its material or build only when those facts are present.",
    "Then add a heading 'Key Specifications:' followed by concise bullets in the format '- Feature: factual detail'. Include only meaningful specifications actually present in the input, such as material, dimensions, colour, condition, movement, capacity, compatibility, or care instructions.",
    "Finish with a heading 'Utility & Compatibility:' and a short factual paragraph explaining operation, fit, pairing, or practical use only when supported by the input.",
    "Use related search terminology naturally only when it accurately describes a supplied fact. Eliminate fluff and filler adjectives. Never invent, estimate, assume, or pad missing specifications; if the input is sparse, accuracy takes priority over reaching 150 words.",
  ].join(" "),
  meta_title: "Output a page title tag. Maximum 60 characters. Put the primary keyword early. Descriptive and specific. No clickbait.",
  meta_description: "Output a factual meta description of 140–155 characters. Put the primary product entity early and summarise only supplied attributes. Do not include calls to action, promotional claims, prices, shipping, or guarantees.",
  google_title: "Output only a Google Shopping product title using this order where supplied: Brand + Model or Product Type + Key Attribute, Colour, or Size. Maximum 150 characters. Use factual language with no promotion or keyword stuffing.",
  google_description: [
    "Output a search-friendly Google Shopping product description in plain text, normally 150–250 words when the supplied facts can support that length.",
    "Integrate the primary product entity and the most important supplied attributes naturally within the first 50 words.",
    "Start with 2–3 concise factual sentences. Add 'Key Specifications:' followed by bullets formatted '- Feature: factual detail'. Finish with 'Utility & Compatibility:' and a short factual paragraph only when operation, fit, pairing, or usage facts were supplied.",
    "Use only supplied product attributes, materials, dimensions, compatibility, colour, condition, care instructions, usage, and physical characteristics. Never invent or pad missing details; accuracy takes priority over word count.",
  ].join(" "),
  label: "Output a product attribute display label. 2–6 words. Short, clear, customer-friendly. Capitalise correctly for the target language.",
  category_description: "Output a category landing page description. 100–200 words. Natural language. Describe what kind of products are in this category and who they are for. Include relevant search terms naturally.",
};

const GMC_DESCRIPTION_ROLES = new Set(["short_description", "description", "google_description"]);
const LONG_PRODUCT_DESCRIPTION_ROLES = new Set(["description", "google_description"]);

const GMC_DESCRIPTION_POLICY = [
  "Apply Google Merchant Center product-description rules with zero tolerance.",
  "Do not use promotional calls to action, sales language, prices, discount terms, guarantees, subjective superlatives, unverifiable claims, shipping claims, return-policy claims, contact details, URLs, email addresses, or store handles.",
  "Do not invent product facts or infer missing specifications.",
  "Use purely factual, professional, information-dense language based only on the supplied text. Never use filler adjectives such as amazing, stunning, incredible, premium, or exceptional unless the term is part of the official supplied product name.",
].join(" ");

function countWords(text: string): number {
  const words = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\*\*|__/g, "")
    .trim()
    .match(/\S+/g);
  return words?.length ?? 0;
}

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

    async function callDeepSeek(correction?: { previousText: string; instruction: string }): Promise<string> {
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: fields.text },
      ];
      if (correction) {
        messages.push(
          { role: "assistant", content: correction.previousText },
          {
            role: "user",
            content: correction.instruction,
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
          temperature: 0.2,
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
    if (LONG_PRODUCT_DESCRIPTION_ROLES.has(fields.fieldRole)) {
      const words = countWords(result);
      if (words < 150 || words > 250) {
        try {
          result = await callDeepSeek({
            previousText: result,
            instruction:
              words > 250
                ? "Rewrite the result to 150–250 words without removing important supplied specifications. Preserve the opening, Key Specifications bullets, and Utility & Compatibility structure. Use only the original supplied facts and return only the revised description."
                : "Rewrite the result toward 150–250 words using only facts present in the original input. Preserve the opening, Key Specifications bullets, and Utility & Compatibility structure. Do not invent, infer, estimate, repeat, or pad details; if the supplied facts cannot support 150 words, remain shorter and accurate. Return only the revised description.",
          });
        } catch {
          // The accurate first result is safer than failing or padding sparse data.
        }
      }
    }

    if (requiresGmcDescriptionCheck) {
      policyValidation = validateProductDescription(result);

      if (!policyValidation.isValid) {
        try {
          result = await callDeepSeek({
            previousText: result,
            instruction: `Rewrite the description again. The previous answer violated GMC policy with these exact terms: ${policyValidation.flaggedTerms.join(", ")}. Remove those terms and any equivalent promotional, pricing, guarantee, shipping, returns, contact, or URL wording. Keep only factual product information from the original input. Preserve the requested SEO structure and return only the corrected description.`,
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
