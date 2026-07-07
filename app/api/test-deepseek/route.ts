import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY not set in environment" }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 5,
        temperature: 0,
        messages: [{ role: "user", content: "Say: OK" }],
      }),
    });

    const body = await res.text();

    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      body: body.slice(0, 500),
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
