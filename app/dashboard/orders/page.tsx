import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getKarivUsersByIds } from "@/lib/kariv-clerk";
import { Badge } from "@/components/ui/badge";
import { OrderManagePanel } from "@/app/dashboard/orders/order-manage-panel";
import type { Order, OrderEscrowStatus } from "@/lib/types";

const STATUS_LABEL: Record<OrderEscrowStatus, string> = {
  pending_review: "Pending Dealer Review",
  dealer_accepted: "Dealer Accepted",
  funds_secured: "Funds Secured",
  shipped: "Shipped",
  verified: "Delivery Confirmed",
  funds_released: "Funds Released to Dealer",
  cancelled: "Order Cancelled",
};

const STATUS_CLASS: Record<OrderEscrowStatus, string> = {
  pending_review: "border-transparent bg-amber-100 text-amber-900",
  dealer_accepted: "border-transparent bg-blue-100 text-blue-900",
  funds_secured: "border-transparent bg-emerald-100 text-emerald-900",
  shipped: "border-transparent bg-indigo-100 text-indigo-900",
  verified: "border-transparent bg-teal-100 text-teal-900",
  funds_released: "border-transparent bg-green-200 text-green-950",
  cancelled: "border-transparent bg-red-100 text-red-900",
};

function orderRef(id: string) {
  return `KRV-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export default async function OrdersPage() {
  const store = await getCurrentStore();
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  const items = (orders ?? []) as Order[];
  const buyerIds = items.map((o) => o.buyer_user_id);
  const buyers = await getKarivUsersByIds(buyerIds);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Orders &amp; Escrow</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Orders placed through your storefront, with escrow status and buyer messaging
      </p>

      <div className="mt-6 space-y-3">
        {items.length === 0 && (
          <div className="rounded-lg border border-border bg-card py-10 text-center text-muted-foreground">
            No orders yet.
          </div>
        )}
        {items.map((order) => {
          const buyer = buyers.get(order.buyer_user_id);
          const item = order.products?.[0];
          return (
            <div key={order.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {item?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="h-14 w-14 rounded-md border border-border object-cover" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-md border border-border bg-muted" />
                  )}
                  <div>
                    <p className="font-medium">{buyer?.name ?? order.buyer_user_id}</p>
                    <p className="text-sm text-muted-foreground">{buyer?.email ?? "—"}</p>
                    <p className="font-mono text-xs text-muted-foreground">{orderRef(order.id)}</p>
                    {item && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.title} <span className="text-xs">({item.condition})</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {order.total_amount} {order.currency}
                  </p>
                  <Badge className={`mt-1 ${STATUS_CLASS[order.escrow_status]}`}>
                    {STATUS_LABEL[order.escrow_status]}
                  </Badge>
                </div>
              </div>

              <OrderManagePanel order={order} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
