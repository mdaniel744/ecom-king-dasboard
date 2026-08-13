"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderMessageCard } from "./order-message-card";
import {
  updateOrderEscrowStatus,
  updateOrderTracking,
  sendOrderMessageToBuyer,
  sendOrderMessageToDealer,
} from "@/app/dashboard/orders/actions";
import { NEXT_ACTION, CANCELLABLE_STATUSES, STATUS_LABEL } from "@/lib/order-display";
import type { Order, OrderMessage } from "@/lib/types";

export function OrderEscrowPanel({
  order,
  messages,
  senderNames,
}: {
  order: Order;
  messages: OrderMessage[];
  senderNames: Record<string, { name: string; email: string | null }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? "");

  function handleAdvance(nextStatus: string) {
    startTransition(async () => {
      const result = await updateOrderEscrowStatus(order.id, nextStatus);
      if (result.success) {
        toast.success("Escrow status updated");
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleCancel() {
    if (!confirm("Cancel this order? This can't be undone from here.")) return;
    startTransition(async () => {
      const result = await updateOrderEscrowStatus(order.id, "cancelled");
      if (result.success) {
        toast.success("Order cancelled");
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleTrackingSave() {
    startTransition(async () => {
      const result = await updateOrderTracking(order.id, trackingNumber);
      if (result.success) {
        toast.success("Tracking number saved");
      } else {
        toast.error(result.error);
      }
    });
  }

  const nextAction = NEXT_ACTION[order.escrow_status];
  const canCancel = CANCELLABLE_STATUSES.includes(order.escrow_status);
  const address = order.shipping_address as
    | { fullName?: string; street?: string; city?: string; postalCode?: string; country?: string }
    | null;

  const buyerMessages = messages.filter((m) => m.recipient_role === "buyer");
  const dealerMessages = messages.filter((m) => m.recipient_role === "dealer");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Escrow Management</p>
          <p className="mt-2 text-sm">
            Current: <span className="font-semibold">{STATUS_LABEL[order.escrow_status]}</span>
          </p>
          <div className="mt-3 space-y-2">
            {nextAction && (
              <Button className="w-full" disabled={isPending} onClick={() => handleAdvance(nextAction.next)}>
                {nextAction.label}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={isPending}
                onClick={handleCancel}
              >
                Cancel Order
              </Button>
            )}
            {!nextAction && !canCancel && (
              <p className="text-sm text-muted-foreground">No further action — this order is closed.</p>
            )}
          </div>

          <div className="mt-4 space-y-1.5 border-t border-border pt-4">
            <div className="flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              <Label>Tracking Number</Label>
            </div>
            <div className="flex gap-2">
              <Input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Enter tracking number..."
              />
              <Button type="button" variant="outline" disabled={isPending} onClick={handleTrackingSave}>
                Save
              </Button>
            </div>
          </div>
        </div>

        {address && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shipping Address</p>
            <p className="mt-2 text-sm font-medium">{address.fullName}</p>
            <p className="text-sm text-muted-foreground">
              {[address.street, address.postalCode, address.city, address.country].filter(Boolean).join(", ")}
            </p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</p>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-muted-foreground">Method</span>
            <span className="font-medium capitalize">{order.payment_method.replace("_", " ")}</span>
          </div>
          {/* payment_reference is a real uploaded-receipt file URL, written
              by the buyer's own confirmPaymentSent() on the storefront while
              escrow_status is dealer_accepted — confirmed with the Kariv
              storefront agent. Not a plain text reference string. */}
          {order.payment_reference ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Payment Receipt</p>
              {/^https?:\/\/.*\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(order.payment_reference) ? (
                <a href={order.payment_reference} target="_blank" rel="noreferrer" className="block w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={order.payment_reference}
                    alt="Payment receipt"
                    className="h-24 w-24 rounded-md border border-border object-cover hover:opacity-80"
                  />
                </a>
              ) : (
                <a
                  href={order.payment_reference}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View Receipt ↗
                </a>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No receipt uploaded yet.</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <OrderMessageCard
          title="Message Buyer"
          placeholder="Type a message to the buyer... (will be emailed and appear in their Mails tab)"
          messages={buyerMessages}
          senderNames={senderNames}
          sendAction={(subject, message) => sendOrderMessageToBuyer(order.id, subject, message)}
        />

        {/* Only shown when this order actually has a dealer assigned —
            most orders don't (dealer_user_id is null unless the product
            came from a dealer's own listing). */}
        {order.dealer_user_id && (
          <OrderMessageCard
            title="Message Dealer"
            placeholder="Type a message to the dealer... (will be emailed and appear in their Sales Messages tab)"
            messages={dealerMessages}
            senderNames={senderNames}
            sendAction={(subject, message) => sendOrderMessageToDealer(order.id, subject, message)}
          />
        )}
      </div>
    </div>
  );
}
