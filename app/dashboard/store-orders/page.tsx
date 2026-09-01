import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CHECKOUT_INVOICE_STATUS_LABEL,
  CHECKOUT_ORDER_STATUS_CLASS,
  CHECKOUT_ORDER_STATUS_LABEL,
  CHECKOUT_PAYMENT_STATUS_LABEL,
  formatOrderMoney,
} from "@/lib/checkout-order-display";
import type { CheckoutOrder } from "@/lib/types";

export default async function StoreOrdersPage() {
  const store = await getCurrentStore();
  const { data } = await supabaseAdmin
    .from("checkout_orders")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });
  const orders = (data ?? []) as CheckoutOrder[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage standard cart and Buy Now orders paid by direct bank transfer
      </p>

      <div className="mt-6 space-y-3">
        {orders.length === 0 && (
          <div className="rounded-lg border border-border bg-card py-12 text-center">
            <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No checkout orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Buy Now and cart checkout orders will appear here.
            </p>
          </div>
        )}

        {orders.map((order) => {
          const itemCount = order.line_items.reduce((total, item) => total + item.quantity, 0);
          return (
            <div key={order.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold">{order.order_number}</p>
                    <Badge className={CHECKOUT_ORDER_STATUS_CLASS[order.order_status]}>
                      {CHECKOUT_ORDER_STATUS_LABEL[order.order_status]}
                    </Badge>
                  </div>
                  <p className="mt-2 font-medium">{order.customer_name}</p>
                  <p className="text-sm text-muted-foreground">{order.customer_email}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {itemCount} {itemCount === 1 ? "item" : "items"} · {CHECKOUT_PAYMENT_STATUS_LABEL[order.payment_status]}
                    {` · Invoice ${CHECKOUT_INVOICE_STATUS_LABEL[order.invoice_status].toLowerCase()}`}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 lg:justify-end">
                  <div className="text-right">
                    <p className="font-semibold">{formatOrderMoney(order.total_amount, order.currency)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href={`/dashboard/store-orders/${order.id}`}>
                      Manage <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
