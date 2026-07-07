"use server";

export async function suggestGoogleCategory(
  name: string,
  description: string | null,
  brand: string | null,
  categoryName: string | null
): Promise<{ category: string | null; error?: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { category: null, error: "DeepSeek API key not configured." };

  const productContext = [
    `Product name: ${name}`,
    description ? `Description: ${description.slice(0, 800)}` : null,
    brand ? `Brand: ${brand}` : null,
    categoryName ? `Store category: ${categoryName}` : null,
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
        max_tokens: 80,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `You are a Google Shopping taxonomy expert. When given a product, you return the single most precise Google Product Taxonomy category path.

Rules:
- Use Google's official taxonomy format with " > " separators
- Be as specific as possible — pick leaf-level categories when they fit
- Return ONLY the category path, nothing else. No explanation, no punctuation before or after.
- Example output: Business & Industrial > Material Handling > Shipping Containers`,
          },
          {
            role: "user",
            content: productContext,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { category: null, error: `DeepSeek error: ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
    const category = raw.replace(/^["']|["']$/g, "").trim();
    return { category: category || null };
  } catch (err) {
    return { category: null, error: err instanceof Error ? err.message : String(err) };
  }
}
