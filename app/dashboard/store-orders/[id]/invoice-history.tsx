import { Download, ExternalLink, FileText } from "lucide-react";
import { getOrderInvoiceDocuments, type InvoiceHistoryResult } from "@/lib/invoice-documents";
import { formatOrderMoney } from "@/lib/checkout-order-display";
import { isLocalDemoMode } from "@/lib/local-demo";
import { Button } from "@/components/ui/button";

export async function InvoiceHistory({ storeId, orderId, previouslySent, history }: {
  storeId: string; orderId: string; previouslySent: boolean; history?: InvoiceHistoryResult;
}) {
  const { documents, error } = history ?? await getOrderInvoiceDocuments(storeId, orderId);
  return (
    <section id="invoice-files" className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Invoice PDFs</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Saved copies of each invoice, including previous sends.</p>
      {isLocalDemoMode && <p className="mt-2 text-xs text-amber-700">Local preview: sending is simulated. No emails are delivered.</p>}
      {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : (
        <>
          {previouslySent && !documents.some(document => document.send_status === "sent") && (
            <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              This order has an earlier emailed invoice without an archived PDF. Resend the invoice to save a new PDF copy;
              the original email cannot be reconstructed exactly.
            </p>
          )}
          {documents.length === 0 && !previouslySent && <p className="mt-4 text-sm text-muted-foreground">No invoice PDFs yet. Send an invoice from Manage order to create one.</p>}
          <ul className="mt-4 divide-y divide-border">
            {documents.map(document => {
              const url = `/dashboard/store-orders/${orderId}/invoices/${document.id}/pdf`;
              return (
                <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{document.invoice_number}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {document.recipient_email} · {document.locale.toUpperCase()} · PDF
                    </p>
                    {document.pricing_snapshot && <p className="mt-1 text-xs text-muted-foreground">
                      Total {formatOrderMoney(document.pricing_snapshot.total, document.pricing_snapshot.currency)}
                      {" · "}Delivery {formatOrderMoney(document.pricing_snapshot.delivery, document.pricing_snapshot.currency)}
                      {" · "}VAT {formatOrderMoney(document.pricing_snapshot.tax, document.pricing_snapshot.currency)}
                    </p>}
                    <p className={`mt-1 text-xs ${document.send_status === "sent" ? "text-emerald-700" : "text-amber-700"}`}>
                      {document.send_status === "sent" ? (isLocalDemoMode ? "Simulated send" : "Sent") : document.send_status === "failed" ? "Email failed - PDF saved" : "Delivery unconfirmed - check email logs before retrying"}
                      {" · "}{new Date(document.sent_at || document.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button asChild variant="outline" size="sm"><a href={url} target="_blank" rel="noopener noreferrer" aria-label={`View invoice ${document.invoice_number} PDF`}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View PDF
                    </a></Button>
                    <Button asChild variant="outline" size="sm"><a href={`${url}?download=1`} aria-label={`Download invoice ${document.invoice_number} PDF`}>
                      <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                    </a></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
