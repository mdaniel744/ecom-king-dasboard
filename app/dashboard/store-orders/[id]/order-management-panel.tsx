"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  formatOrderMoney,
} from "@/lib/checkout-order-display";
import { parseInvoiceNumber, prepareInvoiceDelivery, type InvoiceDeliveryAmounts } from "@/lib/invoice-delivery";
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
  invoiceOrder,
  checkoutTotal,
  invoiceVatRate,
  invoiceEditable,
  invoicePricingError,
  invoiceArchiveError,
}: {
  orderId: string;
  initialOrderStatus: CheckoutOrderStatus;
  initialPaymentStatus: CheckoutPaymentStatus;
  initialTrackingNumber: string;
  initialAdminNotes: string;
  invoiceStatus: CheckoutInvoiceStatus;
  invoiceSentAt: string | null;
  autoInvoice: boolean;
  invoiceOrder: InvoiceDeliveryAmounts & { currency: string; updated_at: string };
  checkoutTotal: number;
  invoiceVatRate: number | null;
  invoiceEditable: boolean;
  invoicePricingError: string | null;
  invoiceArchiveError: string | null;
}) {
  const router = useRouter();
  const [orderStatus, setOrderStatus] = useState(initialOrderStatus);
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [trackingNumber, setTrackingNumber] = useState(initialTrackingNumber);
  const [adminNotes, setAdminNotes] = useState(initialAdminNotes);
  const [isPending, startTransition] = useTransition();
  const [deliveryInput, setDeliveryInput] = useState(invoiceOrder.shipping_amount.toFixed(2));
  const [vatInput, setVatInput] = useState(invoiceVatRate == null ? "" : String(invoiceVatRate));
  useEffect(() => {
    setDeliveryInput(invoiceOrder.shipping_amount.toFixed(2));
    setVatInput(invoiceVatRate == null ? "" : String(invoiceVatRate));
  }, [orderId, invoiceOrder.updated_at, invoiceOrder.shipping_amount, invoiceVatRate]);
  const deliveryFee = parseInvoiceNumber(deliveryInput);
  const vatRate = parseInvoiceNumber(vatInput);
  let invoicePreview = invoiceOrder;
  let deliveryError: string | null = invoicePricingError;
  if (invoiceEditable && !deliveryError) {
    if (deliveryFee == null) deliveryError = "Enter a delivery fee with at most two decimal places. Use 0 for no delivery fee.";
    else if (vatRate == null) deliveryError = "Enter a VAT rate. Use 0 for a VAT-exempt invoice.";
    else {
      try { invoicePreview = prepareInvoiceDelivery(invoiceOrder, deliveryFee, vatRate); }
      catch (error) { deliveryError = error instanceof Error ? error.message : "The invoice amounts could not be calculated."; }
    }
  }
  const money = (amount: number) => formatOrderMoney(amount, invoiceOrder.currency, "en-GB");

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
    if (deliveryError || invoiceArchiveError) return;
    startTransition(async () => {
      const result = await sendCheckoutOrderInvoice(orderId, invoiceEditable ? {
        deliveryFee: deliveryFee!, vatRate: vatRate!, expectedUpdatedAt: invoiceOrder.updated_at,
      } : undefined);
      if (result.success) {
        toast.success("Invoice PDF saved and send completed");
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not send the invoice.");
        router.refresh();
      }
    });
  };

  return (
    <div className="self-start space-y-5 rounded-lg border border-border bg-card p-5">
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

      <div id="customer-invoice" className="scroll-mt-20 border-t border-border pt-5">
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">Customer invoice</p>
            <p className="text-xs text-muted-foreground">
              {CHECKOUT_INVOICE_STATUS_LABEL[invoiceStatus]}
              {invoiceSentAt ? ` · ${new Date(invoiceSentAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : ""}
            </p>
            {autoInvoice && (
              <p className="mt-1 text-xs text-emerald-700">
                Automatic sending is enabled when this order is created.
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={`invoice-delivery-${orderId}`} className="text-sm font-medium">Delivery fee ({invoiceOrder.currency})</label>
            <Input id={`invoice-delivery-${orderId}`} type="number" inputMode="decimal" min={0} max={1_000_000_000} step={0.01}
              value={deliveryInput} onChange={event => setDeliveryInput(event.target.value)} disabled={isPending || !invoiceEditable}
              aria-invalid={Boolean(deliveryError)} aria-describedby={`invoice-pricing-help-${orderId}`} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`invoice-vat-${orderId}`} className="text-sm font-medium">VAT rate (%)</label>
            <Input id={`invoice-vat-${orderId}`} type="number" inputMode="decimal" min={0} max={100} step={0.01}
              value={vatInput} placeholder="Not recorded" onChange={event => setVatInput(event.target.value)} disabled={isPending || !invoiceEditable}
              aria-invalid={Boolean(deliveryError)} />
          </div>
        </div>
        <p id={`invoice-pricing-help-${orderId}`} className="mt-2 text-xs text-muted-foreground">
          {invoiceEditable ? "Applies to the new invoice only. Original checkout and earlier PDFs stay unchanged."
            : "Paid, refunded, completed and cancelled orders keep their saved invoice amounts."}
        </p>
        {autoInvoice && <p className="mt-2 text-xs text-muted-foreground">
          To add delivery before the first invoice is sent, turn off automatic sending in <Link href="/dashboard/invoices/settings" className="text-primary underline">Invoice Settings</Link>.
        </p>}
        {deliveryError ? <p role="alert" className="mt-3 text-sm text-destructive">{deliveryError}</p> : (
          <dl className="mt-4 space-y-2 rounded-md bg-muted/40 p-3 text-sm" aria-label="Invoice calculation">
            <div className="flex justify-between gap-2"><dt>Items (net)</dt><dd>{money(invoicePreview.subtotal)}</dd></div>
            {invoicePreview.discount_amount > 0 && <div className="flex justify-between gap-2"><dt>Discount</dt><dd>{money(-invoicePreview.discount_amount)}</dd></div>}
            <div className="flex justify-between gap-2"><dt>Delivery</dt><dd>{money(invoicePreview.shipping_amount)}</dd></div>
            {invoiceEditable && <div className="flex justify-between gap-2 text-muted-foreground"><dt>Taxable amount</dt><dd>{money(Math.round((invoicePreview.subtotal - invoicePreview.discount_amount + invoicePreview.shipping_amount) * 100) / 100)}</dd></div>}
            <div className="flex justify-between gap-2"><dt>VAT{invoicePreview.tax_rate != null ? ` (${invoicePreview.tax_rate}%)` : ""}</dt><dd>{money(invoicePreview.tax_amount)}</dd></div>
            <div className="flex justify-between gap-2 border-t border-border pt-2 font-semibold"><dt>Invoice total</dt><dd>{money(invoicePreview.total_amount)}</dd></div>
          </dl>
        )}
        {!deliveryError && invoicePreview.total_amount !== checkoutTotal && <p className="mt-2 text-xs text-amber-700">
          This invoice differs from the original checkout total of {money(checkoutTotal)}.
        </p>}
        {invoiceArchiveError && <p role="alert" className="mt-3 text-sm text-destructive">{invoiceArchiveError}</p>}
        <Button type="button" variant="outline" className="mt-3 w-full" disabled={isPending || Boolean(deliveryError) || Boolean(invoiceArchiveError)} onClick={sendInvoice}>
          {invoiceStatus === "sent" ? "Resend Invoice" : "Send Invoice Now"}
        </Button>
      </div>
    </div>
  );
}
