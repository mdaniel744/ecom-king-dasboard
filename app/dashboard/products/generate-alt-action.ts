"use server";

export async function generateImageAlt(
  name: string,
  description: string | null,
  brand: string | null,
  imageIndex: number
): Promise<{ alt: string | null; error?: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { alt: null, error: "DeepSeek API key not configured." };

  const context = [
    `Product name: ${name}`,
    brand ? `Brand: ${brand}` : null,
    description ? `Description: ${description.slice(0, 600)}` : null,
    `Image position: ${imageIndex === 0 ? "main/primary product image" : `additional image #${imageIndex + 1}`}`,
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
        max_tokens: 60,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `Write SEO-optimized alt text for a product image.

Rules:
- Be descriptive and specific: include the product name, key visible characteristics, and view angle if relevant
- Keep it between 10 and 125 characters
- Do NOT start with "Image of" or "Photo of" — Google ignores those prefixes
- Do NOT keyword-stuff — write naturally as if describing the image to someone who cannot see it
- Return ONLY the alt text string, nothing else`,
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
      return { alt: null, error: `DeepSeek error: ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    const alt = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return { alt: alt || null };
  } catch (err) {
    return { alt: null, error: err instanceof Error ? err.message : String(err) };
  }
}
