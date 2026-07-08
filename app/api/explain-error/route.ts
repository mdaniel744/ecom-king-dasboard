import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a helpful assistant for an e-commerce dashboard used by non-technical store owners.
A Google Merchant Center sync error occurred. Explain it in plain, friendly language — no jargon, no API terms, no GCP references.
Respond with a JSON object with exactly two fields:
- "explanation": one sentence saying what went wrong (as if talking to a shopkeeper, not a developer)
- "action": one or two sentences on the exact steps they should take to fix it

Example output:
{"explanation":"Google refused the product because the price is missing.","action":"Open the product, add a price, then click the sync icon to try again."}

Return ONLY valid JSON. No markdown, no code fences, no extra text.`;

export async function POST(req: NextRequest) {
  const { error } = await req.json().catch(() => ({ error: "" }));
  if (!error) {
    return NextResponse.json({ explanation: "An unknown error occurred.", action: "Try syncing again." });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ explanation: null, action: null }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: error },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
    });

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw);
    return NextResponse.json({ explanation: parsed.explanation ?? null, action: parsed.action ?? null });
  } catch {
    return NextResponse.json({ explanation: null, action: null }, { status: 500 });
  }
}
