"use server";

import { randomBytes } from "crypto";

export async function generateMpn(
  name: string,
  brand: string | null,
  categoryName: string | null
): Promise<{ mpn: string | null; error?: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { mpn: null, error: "DeepSeek API key not configured." };

  const uniqueSuffix = randomBytes(2).toString("hex").toUpperCase();

  const context = [
    `Product name: ${name}`,
    brand ? `Brand: ${brand}` : null,
    categoryName ? `Category: ${categoryName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 20,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `Generate a structured MPN (Manufacturer Part Number) code for a product.
Format: [BRAND_CODE]-[PRODUCT_CODE] where BRAND_CODE is 2-4 uppercase letters from the brand name, and PRODUCT_CODE is 4-8 uppercase letters/numbers derived from the key product traits.
Example: brand "Tweeinx", product "20ft High Cube Container Anthrazit" → TWX-20FTHCA
Use only uppercase letters and numbers with one hyphen separator. Return ONLY the code, nothing else.`,
          },
          {
            role: "user",
            content: context,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { mpn: null, error: `DeepSeek error: ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
    const base = raw.replace(/[^A-Z0-9-]/gi, "").toUpperCase().slice(0, 12);
    const mpn = base ? `${base}-${uniqueSuffix}` : `MPN-${uniqueSuffix}`;
    return { mpn };
  } catch (err) {
    return { mpn: null, error: err instanceof Error ? err.message : String(err) };
  }
}
