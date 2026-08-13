"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Truck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/dashboard/rich-text-editor";
import {
  updateOrderEscrowStatus,
  updateOrderTracking,
  sendOrderMessageToBuyer,
} from "@/app/dashboard/orders/actions";
import { stripHtml } from "@/lib/html";
import { NEXT_ACTION, CANCELLABLE_STATUSES, STATUS_LABEL } from "@/lib/order-display";
import type { Order } from "@/lib/types";

export function OrderEscrowPanel({ order }: { order: Order }) {
  const [isPending, startTransition] = useTransition();
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

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

  function handleSendMessage() {
    if (!stripHtml(message).trim()) {
      toast.error("Write a message first.");
      return;
    }
    startTransition(async () => {
      const result = await sendOrderMessageToBuyer(order.id, subject, message);
      if (result.success) {
        toast.success("Message sent to buyer");
        setSubject("");
        setMessage("");
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

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-1.5">
          <Send className="h-3.5 w-3.5 text-muted-foreground" />
          <Label>Message Buyer</Label>
        </div>
        <div className="mt-2 space-y-2">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (optional)..."
          />
          <RichTextEditor
            value={message}
            onChange={setMessage}
            placeholder="Type a message to the buyer... (will be emailed and appear in their Mails tab)"
          />
          <Button type="button" disabled={isPending} onClick={handleSendMessage} className="w-full">
            Send Message to Buyer
          </Button>
        </div>
        {/* Message thread (buyer/dealer replies) intentionally not built
            yet — pending confirmation of how dealer-authored messages
            reach order_messages from the storefront's dealer portal. */}
      </div>
    </div>
  );
}
