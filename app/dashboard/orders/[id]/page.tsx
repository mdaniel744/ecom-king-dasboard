import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Package } from "lucide-react";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getKarivUsersByIds } from "@/lib/kariv-clerk";
import { Badge } from "@/components/ui/badge";
import { OrderTracker } from "./order-tracker";
import { OrderEscrowPanel } from "./order-escrow-panel";
import { STATUS_LABEL, STATUS_CLASS, STATUS_BANNER, orderRef, escrowStepIndex } from "@/lib/order-display";
import type { Order, OrderMessage } from "@/lib/types";
import { validateId } from "@/lib/validation";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let orderId: string;
  try {
    orderId = validateId(id);
  } catch {
    notFound();
  }

  const store = await getCurrentStore();
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("store_id", store.id)
    .single();

  if (!order) notFound();
  const typedOrder = order as Order;

  const { data: messages } = await supabaseAdmin
    .from("order_messages")
    .select("*")
    .eq("order_id", typedOrder.id)
    .order("created_at", { ascending: true });
  const typedMessages = (messages ?? []) as OrderMessage[];

  // Buyer and dealer messages carry a Clerk user id we can resolve to a
  // name — admin/system messages don't need this (labeled by role instead).
  const clerkIdsToResolve = [
    typedOrder.buyer_user_id,
    ...typedMessages.filter((m) => m.sender === "buyer" || m.sender === "dealer").map((m) => m.sender_user_id),
  ];
  const buyers = await getKarivUsersByIds(clerkIdsToResolve);
  const buyer = buyers.get(typedOrder.buyer_user_id);
  const stepIndex = escrowStepIndex(typedOrder.escrow_status);
  const item = typedOrder.products?.[0];

  return (
    <div>
      <Link
        href="/dashboard/orders"
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Orders
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{buyer?.name ?? typedOrder.buyer_user_id}</h1>
          <p className="text-sm text-muted-foreground">{buyer?.email ?? "—"}</p>
          <p className="font-mono text-xs text-muted-foreground">{orderRef(typedOrder.id)}</p>
        </div>
        <Badge className={STATUS_CLASS[typedOrder.escrow_status]}>{STATUS_LABEL[typedOrder.escrow_status]}</Badge>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        {stepIndex ? (
          <OrderTracker currentStep={stepIndex} />
        ) : (
          <p className="text-center text-sm font-medium text-destructive">This order was cancelled.</p>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>{STATUS_BANNER[typedOrder.escrow_status]}</p>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order Items</p>
        </div>
        {item && (
          <div className="mt-3 flex items-center gap-3">
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-md border border-border bg-muted" />
            )}
            <div>
              {item.brand && (
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{item.brand}</p>
              )}
              <p className="font-medium">{item.title}</p>
              {item.condition && <p className="text-sm text-muted-foreground">{item.condition}</p>}
            </div>
            <p className="ml-auto font-semibold">
              {item.price} {item.currency}
            </p>
          </div>
        )}
        <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>
              {typedOrder.total_amount} {typedOrder.currency}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Insured Shipping</span>
            <span>Free</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>
              {typedOrder.total_amount} {typedOrder.currency}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <OrderEscrowPanel
          order={typedOrder}
          messages={typedMessages}
          senderNames={Object.fromEntries(buyers.entries())}
        />
      </div>
    </div>
  );
}
