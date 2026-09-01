import Link from "next/link";
import { CircleDollarSign, Clock3, CreditCard, RotateCcw } from "lucide-react";
import { PaymentSettingsForm } from "@/app/dashboard/payments/payment-settings-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHECKOUT_PAYMENT_STATUS_LABEL, formatOrderMoney } from "@/lib/checkout-order-display";
import { getCurrentStore } from "@/lib/get-current-store";
import { getPaymentSettings } from "@/lib/payment-settings";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CheckoutOrder, CheckoutPaymentStatus } from "@/lib/types";

const paymentStatusClass: Record<CheckoutPaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  paid: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  failed: "bg-red-100 text-red-800 hover:bg-red-100",
  refunded: "bg-violet-100 text-violet-800 hover:bg-violet-100",
};

function groupedTotal(orders: CheckoutOrder[]) {
  const totals = new Map<string, number>();
  for (const order of orders) {
    totals.set(order.currency, (totals.get(order.currency) ?? 0) + order.total_amount);
  }
  if (totals.size === 0) return "—";
  return Array.from(totals, ([currency, amount]) => formatOrderMoney(amount, currency)).join(" · ");
}

export default async function PaymentsPage() {
  const store = await getCurrentStore();
  const [settings, ordersResult] = await Promise.all([
    getPaymentSettings(store.id),
    supabaseAdmin
      .from("checkout_orders")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false }),
  ]);
  const orders = (ordersResult.data ?? []) as CheckoutOrder[];
  const paidOrders = orders.filter((order) => order.payment_status === "paid");
  const pendingOrders = orders.filter((order) => order.payment_status === "pending");
  const reversedOrders = orders.filter((order) => ["failed", "refunded"].includes(order.payment_status));
  const activeMethods = [settings.bank_transfer_enabled, settings.card_enabled, settings.crypto_enabled].filter(Boolean).length;

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure payment methods and monitor payment activity for {store.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><a href="#payment-activity">View activity</a></Button>
          <Button asChild><a href="#payment-methods"><CreditCard className="mr-2 h-4 w-4" /> Payment methods</a></Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Payments received" value={groupedTotal(paidOrders)} detail={`${paidOrders.length} confirmed`} icon={CircleDollarSign} />
        <SummaryCard label="Awaiting payment" value={groupedTotal(pendingOrders)} detail={`${pendingOrders.length} pending`} icon={Clock3} />
        <SummaryCard label="Failed or refunded" value={String(reversedOrders.length)} detail="Requires review" icon={RotateCcw} />
        <SummaryCard label="Active methods" value={String(activeMethods)} detail="Bank, card, or crypto" icon={CreditCard} />
      </div>

      <div className="mt-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Payment methods</h2>
          <p className="text-sm text-muted-foreground">Each store keeps its own checkout and receiving details.</p>
        </div>
        <PaymentSettingsForm initialSettings={settings} />
      </div>

      <Card id="payment-activity" className="mt-8 scroll-mt-6">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Payment activity</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Reconcile transfer references and update payment status from the related order.
            </p>
          </div>
          <Badge variant="outline">{orders.length} transactions</Badge>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No payment activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-3 font-medium">Reference</th>
                    <th className="pb-3 font-medium">Order</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Method</th>
                    <th className="pb-3 text-right font-medium">Amount</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="py-4 font-mono text-xs">{order.payment_reference || "Not supplied"}</td>
                      <td className="py-4 font-mono text-xs font-semibold">{order.order_number}</td>
                      <td className="py-4">{order.customer_name}</td>
                      <td className="py-4 text-muted-foreground">Direct bank transfer</td>
                      <td className="py-4 text-right font-semibold">{formatOrderMoney(order.total_amount, order.currency)}</td>
                      <td className="py-4">
                        <Badge className={paymentStatusClass[order.payment_status]}>{CHECKOUT_PAYMENT_STATUS_LABEL[order.payment_status]}</Badge>
                      </td>
                      <td className="py-4 text-right">
                        <Button asChild size="sm" variant="ghost"><Link href={`/dashboard/store-orders/${order.id}`}>Review</Link></Button>
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

function SummaryCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof CreditCard }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span>
      </CardContent>
    </Card>
  );
}
