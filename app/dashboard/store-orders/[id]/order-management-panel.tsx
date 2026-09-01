"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CHECKOUT_INVOICE_STATUS_LABEL,
  CHECKOUT_ORDER_STATUS_LABEL,
  CHECKOUT_PAYMENT_STATUS_LABEL,
} from "@/lib/checkout-order-display";
import {
  sendCheckoutOrderInvoice,
  updateCheckoutOrder,
} from "@/app/dashboard/store-orders/actions";
import type {
  CheckoutInvoiceStatus,
  CheckoutOrderStatus,
  CheckoutPaymentStatus,
} from "@/lib/types";

const orderStatuses = Object.entries(CHECKOUT_ORDER_STATUS_LABEL) as Array<
  [CheckoutOrderStatus, string]
>;
const paymentStatuses = Object.entries(CHECKOUT_PAYMENT_STATUS_LABEL) as Array<
  [CheckoutPaymentStatus, string]
>;

export function OrderManagementPanel({
  orderId,
  initialOrderStatus,
  initialPaymentStatus,
  initialTrackingNumber,
  initialAdminNotes,
  invoiceStatus,
  invoiceSentAt,
  autoInvoice,
}: {
  orderId: string;
  initialOrderStatus: CheckoutOrderStatus;
  initialPaymentStatus: CheckoutPaymentStatus;
  initialTrackingNumber: string;
  initialAdminNotes: string;
  invoiceStatus: CheckoutInvoiceStatus;
  invoiceSentAt: string | null;
  autoInvoice: boolean;
}) {
  const router = useRouter();
  const [orderStatus, setOrderStatus] = useState(initialOrderStatus);
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [trackingNumber, setTrackingNumber] = useState(initialTrackingNumber);
  const [adminNotes, setAdminNotes] = useState(initialAdminNotes);
  const [isPending, startTransition] = useTransition();

  const saveOrder = () => {
    startTransition(async () => {
      const result = await updateCheckoutOrder(orderId, {
        orderStatus,
        paymentStatus,
        trackingNumber,
        adminNotes,
      });
      if (result.success) {
        toast.success("Order updated");
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not update the order.");
      }
    });
  };

  const sendInvoice = () => {
    startTransition(async () => {
      const result = await sendCheckoutOrderInvoice(orderId);
      if (result.success) {
        toast.success(invoiceStatus === "sent" ? "Invoice sent again" : "Invoice sent");
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not send the invoice.");
      }
    });
  };

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="font-semibold">Manage order</h2>
        <p className="text-sm text-muted-foreground">
          Update payment, fulfilment, tracking, and internal notes.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Order status</label>
        <Select value={orderStatus} onValueChange={(value) => setOrderStatus(value as CheckoutOrderStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {orderStatuses.map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Payment status</label>
        <Select value={paymentStatus} onValueChange={(value) => setPaymentStatus(value as CheckoutPaymentStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {paymentStatuses.map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label htmlFor="tracking-number" className="text-sm font-medium">Tracking number</label>
        <Input
          id="tracking-number"
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value)}
          placeholder="Add after dispatch"
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="order-admin-notes" className="text-sm font-medium">Internal notes</label>
        <Textarea
          id="order-admin-notes"
          value={adminNotes}
          onChange={(event) => setAdminNotes(event.target.value)}
          placeholder="Private notes for staff…"
          rows={5}
          maxLength={5000}
        />
      </div>

      <Button type="button" className="w-full" disabled={isPending} onClick={saveOrder}>
        Save Order
      </Button>

      <div className="border-t border-border pt-5">
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">Customer invoice</p>
            <p className="text-xs text-muted-foreground">
              {CHECKOUT_INVOICE_STATUS_LABEL[invoiceStatus]}
              {invoiceSentAt ? ` · ${new Date(invoiceSentAt).toLocaleString()}` : ""}
            </p>
            {autoInvoice && (
              <p className="mt-1 text-xs text-emerald-700">
                Automatic sending is enabled when this order is created.
              </p>
            )}
          </div>
        </div>
        <Button type="button" variant="outline" className="mt-3 w-full" disabled={isPending} onClick={sendInvoice}>
          {invoiceStatus === "sent" ? "Resend Invoice" : "Send Invoice Now"}
        </Button>
      </div>
    </div>
  );
}
