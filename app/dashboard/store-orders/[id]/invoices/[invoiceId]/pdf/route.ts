import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validateId } from "@/lib/validation";
import { invoicePdfFilename } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; invoiceId: string }> }) {
  const store = await getCurrentStore();
  const params = await context.params;
  let orderId: string, invoiceId: string;
  try { orderId = validateId(params.id); invoiceId = validateId(params.invoiceId); }
  catch { return new Response("Invoice not found", { status: 404 }); }
  const { data, error } = await supabaseAdmin.from("checkout_invoice_documents")
    .select("invoice_number,pdf_base64")
    .eq("id", invoiceId).eq("order_id", orderId).eq("store_id", store.id).maybeSingle();
  if (error) return new Response("Invoice temporarily unavailable", { status: 503, headers: { "Cache-Control": "private, no-store" } });
  if (!data) return new Response("Invoice not found", { status: 404 });
  const pdf = Buffer.from(data.pdf_base64, "base64");
  if (pdf.subarray(0, 5).toString() !== "%PDF-") {
    return new Response("Invoice file is damaged. Contact support.", { status: 500 });
  }
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  return new Response(new Uint8Array(pdf), { headers: {
    "Content-Type": "application/pdf",
    "Content-Length": String(pdf.length),
    "Content-Disposition": `${disposition}; filename="${invoicePdfFilename(data.invoice_number)}"`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Content-Security-Policy": "frame-ancestors 'self'",
    "Referrer-Policy": "no-referrer",
  } });
}
