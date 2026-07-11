import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendMail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.INQUIRY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json().catch(() => ({ id: null }));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: inquiry } = await supabaseAdmin
    .from("inquiries")
    .select("id, store_id, product_id, customer_name, customer_email, customer_phone, message, created_at")
    .eq("id", id)
    .single();
  if (!inquiry) return NextResponse.json({ ok: true });

  const { data: store } = await supabaseAdmin
    .from("stores")
    .select("name, notification_email")
    .eq("id", inquiry.store_id)
    .single();
  if (!store?.notification_email) return NextResponse.json({ ok: true });

  let productName: string | null = null;
  if (inquiry.product_id) {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("name")
      .eq("id", inquiry.product_id)
      .single();
    productName = product?.name ?? null;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mycontainergmbh.com";
  const dashboardUrl = `${appUrl.replace(/\/$/, "")}/dashboard/inquiries`;

  try {
    await sendMail({
      to: store.notification_email,
      subject: `New inquiry${productName ? ` — ${productName}` : ""} — ${store.name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px;">
          <h2 style="margin-bottom: 4px;">New customer inquiry</h2>
          <p style="color: #666; margin-top: 0;">${store.name}${productName ? ` &middot; ${productName}` : ""}</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 4px 0; color: #666;">Name</td><td style="padding: 4px 0;">${inquiry.customer_name ?? "—"}</td></tr>
            <tr><td style="padding: 4px 0; color: #666;">Email</td><td style="padding: 4px 0;">${inquiry.customer_email ?? "—"}</td></tr>
            <tr><td style="padding: 4px 0; color: #666;">Phone</td><td style="padding: 4px 0;">${inquiry.customer_phone ?? "—"}</td></tr>
          </table>
          <p style="white-space: pre-wrap;">${inquiry.message ?? ""}</p>
          <p style="margin-top: 24px;"><a href="${dashboardUrl}">View in dashboard →</a></p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send inquiry notification email:", err);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
