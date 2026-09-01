import Link from "next/link";
import {
  ArrowRight,
  AlertTriangle,
  CircleDollarSign,
  FileCheck2,
  Palette,
  ReceiptText,
} from "lucide-react";
import { InvoiceSectionNav } from "@/app/dashboard/invoices/invoice-section-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHECKOUT_INVOICE_STATUS_LABEL,
  formatOrderMoney,
} from "@/lib/checkout-order-display";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CheckoutInvoiceStatus, CheckoutOrder } from "@/lib/types";

const invoiceStatusClass: Record<CheckoutInvoiceStatus, string> = {
  not_sent: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  sent: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  failed: "bg-red-100 text-red-800 hover:bg-red-100",
};

function groupedTotal(orders: CheckoutOrder[]) {
  const totals = new Map<string, number>();
  for (const order of orders) {
    totals.set(order.currency, (totals.get(order.currency) ?? 0) + order.total_amount);
  }
  if (totals.size === 0) return "—";
  return Array.from(totals, ([currency, amount]) => formatOrderMoney(amount, currency)).join(" · ");
}

export default async function InvoicesPage() {
  const store = await getCurrentStore();
  const { data } = await supabaseAdmin
    .from("checkout_orders")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });
  const orders = (data ?? []) as CheckoutOrder[];
  const invoices = orders.filter(
    (order) => Boolean(order.invoice_number) || order.invoice_status !== "not_sent"
  );
  const sentInvoices = invoices.filter((invoice) => invoice.invoice_status === "sent");
  const failedInvoices = invoices.filter((invoice) => invoice.invoice_status === "failed");

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage generated invoices and document delivery for {store.name}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/invoices/settings">
            <Palette className="mr-2 h-4 w-4" /> Customize invoice
          </Link>
        </Button>
      </div>

      <InvoiceSectionNav active="register" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Generated invoices"
          value={String(invoices.length)}
          detail="Across standard checkout orders"
          icon={ReceiptText}
        />
        <SummaryCard
          label="Total invoiced"
          value={groupedTotal(invoices)}
          detail="Combined generated invoice value"
          icon={CircleDollarSign}
        />
        <SummaryCard
          label="Sent successfully"
          value={String(sentInvoices.length)}
          detail="Delivered to customers"
          icon={FileCheck2}
        />
        <SummaryCard
          label="Delivery issues"
          value={String(failedInvoices.length)}
          detail="Failed invoices requiring review"
          icon={AlertTriangle}
        />
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Invoice register</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Every invoice generated for this store, linked back to its order.
            </p>
          </div>
          <Badge variant="outline">{invoices.length} total</Badge>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <ReceiptText className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No invoices generated yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Send an invoice from an order and it will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-3 font-medium">Invoice</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Issued</th>
                    <th className="pb-3 text-right font-medium">Total</th>
                    <th className="pb-3 font-medium">Invoice status</th>
                    <th className="pb-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="py-4">
                        <p className="font-mono text-xs font-semibold">{invoice.invoice_number || "Number pending"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{invoice.order_number}</p>
                      </td>
                      <td className="py-4">
                        <p className="font-medium">{invoice.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{invoice.customer_email}</p>
                      </td>
                      <td className="py-4 text-muted-foreground">
                        {new Date(invoice.invoice_sent_at || invoice.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4 text-right font-semibold">
                        {formatOrderMoney(invoice.total_amount, invoice.currency)}
                      </td>
                      <td className="py-4">
                        <Badge className={invoiceStatusClass[invoice.invoice_status]}>
                          {CHECKOUT_INVOICE_STATUS_LABEL[invoice.invoice_status]}
                        </Badge>
                      </td>
                      <td className="py-4 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/store-orders/${invoice.id}`}>
                            Manage <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof ReceiptText;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </CardContent>
    </Card>
  );
}
