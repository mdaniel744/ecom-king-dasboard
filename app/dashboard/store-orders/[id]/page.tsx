import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  Mail,
  MapPin,
  Package,
  Phone,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validateId } from "@/lib/validation";
import {
  addressLines,
  CHECKOUT_INVOICE_STATUS_LABEL,
  CHECKOUT_ORDER_STATUS_CLASS,
  CHECKOUT_ORDER_STATUS_LABEL,
  CHECKOUT_PAYMENT_STATUS_LABEL,
  formatOrderMoney,
} from "@/lib/checkout-order-display";
import { OrderManagementPanel } from "./order-management-panel";
import type { CheckoutOrder } from "@/lib/types";

function AddressBlock({ title, address }: { title: string; address: CheckoutOrder["billing_address"] }) {
  const lines = addressLines(address);
  return (
    <div>
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <MapPin className="h-3 w-3" /> {title}
      </p>
      {lines.length ? (
        <div className="mt-2 space-y-0.5 text-sm">
          {lines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Not provided</p>
      )}
    </div>
  );
}

export default async function StoreOrderDetailPage({ params }: PageProps<"/dashboard/store-orders/[id]">) {
  const { id } = await params;
  let orderId: string;
  try {
    orderId = validateId(id);
  } catch {
    notFound();
  }

  const store = await getCurrentStore();
  const { data } = await supabaseAdmin
    .from("checkout_orders")
    .select("*")
    .eq("id", orderId)
    .eq("store_id", store.id)
    .single();

  if (!data) notFound();
  const order = data as CheckoutOrder;

  return (
    <div>
      <Link
        href="/dashboard/store-orders"
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Orders
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-muted-foreground">{order.order_number}</p>
          <h1 className="mt-1 text-2xl font-semibold">{order.customer_name}</h1>
          <p className="text-sm text-muted-foreground">
            Placed {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
        <Badge className={CHECKOUT_ORDER_STATUS_CLASS[order.order_status]}>
          {CHECKOUT_ORDER_STATUS_LABEL[order.order_status]}
        </Badge>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Customer and delivery</h2>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div className="space-y-3 text-sm">
                <p className="font-medium">{order.customer_name}</p>
                <p className="flex items-center gap-2 break-all text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> {order.customer_email}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> {order.customer_phone || "—"}
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 sm:col-span-2">
                <AddressBlock title="Billing address" address={order.billing_address} />
                <AddressBlock title="Delivery address" address={order.delivery_address} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Products</h2>
            </div>
            <div className="mt-4 divide-y divide-border">
              {order.line_items.map((item, index) => (
                <div key={`${item.product_id}-${index}`} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded-md border border-border bg-muted" />
                  )}
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/products/${item.product_id}/edit`}
                      className="font-medium text-primary hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      Quantity {item.quantity}{item.condition ? ` · ${item.condition}` : ""}
                    </p>
                    {item.brand && <p className="text-xs text-muted-foreground">{item.brand}</p>}
                  </div>
                  <p className="ml-auto text-right font-medium">
                    {formatOrderMoney(item.price * item.quantity, order.currency)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Checkout price breakdown</h2>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatOrderMoney(order.subtotal, order.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{formatOrderMoney(order.discount_amount, order.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{formatOrderMoney(order.shipping_amount, order.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatOrderMoney(order.tax_amount, order.currency)}</span></div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold"><span>Total</span><span>{formatOrderMoney(order.total_amount, order.currency)}</span></div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Payment and invoice</h2>
            </div>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Payment method</p><p className="mt-1">Direct bank transfer</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Payment status</p><p className="mt-1">{CHECKOUT_PAYMENT_STATUS_LABEL[order.payment_status]}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Payment reference</p><p className="mt-1">{order.payment_reference || "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Invoice</p><p className="mt-1">{order.invoice_number || "Not numbered"} · {CHECKOUT_INVOICE_STATUS_LABEL[order.invoice_status]}</p></div>
            </div>
            {order.customer_note && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer note</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{order.customer_note}</p>
              </div>
            )}
          </section>
        </div>

        <OrderManagementPanel
          orderId={order.id}
          initialOrderStatus={order.order_status}
          initialPaymentStatus={order.payment_status}
          initialTrackingNumber={order.tracking_number ?? ""}
          initialAdminNotes={order.admin_notes ?? ""}
          invoiceStatus={order.invoice_status}
          invoiceSentAt={order.invoice_sent_at}
          autoInvoice={order.auto_invoice}
        />
      </div>
    </div>
  );
}
