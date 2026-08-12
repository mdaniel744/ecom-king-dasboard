"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Truck, Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/dashboard/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateOrderEscrowStatus,
  updateOrderTracking,
  sendOrderMessageToBuyer,
} from "@/app/dashboard/orders/actions";
import { stripHtml } from "@/lib/html";
import type { Order } from "@/lib/types";

const ESCROW_STATUS_OPTIONS: { value: Order["escrow_status"]; label: string }[] = [
  { value: "pending_review", label: "Pending Dealer Review" },
  { value: "dealer_accepted", label: "Dealer Accepted — Awaiting Payment" },
  { value: "funds_secured", label: "Funds Secured" },
  { value: "shipped", label: "Watch Shipped" },
  { value: "verified", label: "Delivery Confirmed" },
  { value: "funds_released", label: "Funds Released to Dealer" },
  { value: "cancelled", label: "Order Cancelled" },
];

export function OrderManagePanel({ order }: { order: Order }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  function handleEscrowChange(value: string) {
    startTransition(async () => {
      const result = await updateOrderEscrowStatus(order.id, value);
      if (result.success) {
        toast.success("Escrow status updated");
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

  const address = order.shipping_address as
    | { fullName?: string; street?: string; city?: string; postalCode?: string; country?: string }
    | null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        Manage
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="space-y-1.5">
            <Label>Escrow Status</Label>
            <Select value={order.escrow_status} onValueChange={handleEscrowChange} disabled={isPending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESCROW_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
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

          {address && (
            <div className="space-y-1">
              <Label>Ship To</Label>
              <p className="text-sm font-medium">{address.fullName}</p>
              <p className="text-sm text-muted-foreground">
                {[address.street, address.postalCode, address.city, address.country].filter(Boolean).join(", ")}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5 text-muted-foreground" />
              <Label>Message Buyer</Label>
            </div>
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
        </div>
      )}
    </div>
  );
}
