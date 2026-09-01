import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Mail,
  MapPin,
  Package,
  Phone,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validateId } from "@/lib/validation";
import {
  asRecord,
  humanizeKey,
  inquiryRef,
  readableValue,
} from "@/lib/inquiry-display";
import { InquiryManagementPanel } from "./inquiry-management-panel";
import type { Inquiry, Product } from "@/lib/types";

type InquiryProduct = Pick<
  Product,
  "id" | "name" | "slug" | "price" | "currency" | "sku" | "images"
>;

function addressText(value: unknown) {
  const address = asRecord(value);
  return [
    readableValue(address.address_line_1 ?? address.street),
    readableValue(address.address_line_2),
    readableValue(address.city),
    readableValue(address.state),
    readableValue(address.postal_code ?? address.postcode),
    readableValue(address.country),
  ]
    .filter(Boolean)
    .join(", ");
}

export default async function InquiryDetailPage({ params }: PageProps<"/dashboard/inquiries/[id]">) {
  const { id } = await params;
  let inquiryId: string;
  try {
    inquiryId = validateId(id);
  } catch {
    notFound();
  }

  const store = await getCurrentStore();
  const { data } = await supabaseAdmin
    .from("inquiries")
    .select("*")
    .eq("id", inquiryId)
    .eq("store_id", store.id)
    .single();

  if (!data) notFound();
  const inquiry = data as Inquiry;

  let product: InquiryProduct | null = null;
  if (inquiry.product_id) {
    const { data: productData } = await supabaseAdmin
      .from("products")
      .select("id, name, slug, price, currency, sku, images")
      .eq("id", inquiry.product_id)
      .eq("store_id", store.id)
      .single();
    product = productData as InquiryProduct | null;
  }

  const details = asRecord(inquiry.details);
  const customerDetails = asRecord(details.customer);
  const productDetails = asRecord(details.product);
  const requestDetails = asRecord(
    details.price_request_form ?? details.price_on_request ?? details.request
  );

  const customerName =
    inquiry.customer_name ?? readableValue(customerDetails.name) ?? "Anonymous customer";
  const company =
    inquiry.customer_company ?? readableValue(customerDetails.company ?? details.company);
  const address =
    addressText(inquiry.customer_address) ||
    addressText(customerDetails.address ?? details.customer_address);
  const requestedProductName =
    product?.name ?? readableValue(productDetails.name ?? details.product_name) ?? "General inquiry";
  const configuredDomain = store.domain
    ? store.domain.startsWith("http")
      ? store.domain
      : `https://${store.domain}`
    : null;
  const productUrl =
    inquiry.product_url ??
    readableValue(productDetails.url ?? details.product_url) ??
    (configuredDomain && product
      ? `${configuredDomain.replace(/\/$/, "")}/${store.product_url_path}/${product.slug}`
      : null);
  const formRows = Object.entries(requestDetails).flatMap(([key, value]) => {
    const readable = readableValue(value);
    return readable ? [{ label: humanizeKey(key), value: readable }] : [];
  });

  return (
    <div>
      <Link
        href="/dashboard/inquiries"
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Inquiries
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-muted-foreground">{inquiryRef(inquiry)}</p>
          <h1 className="mt-1 text-2xl font-semibold">{customerName}</h1>
          <p className="text-sm text-muted-foreground">
            Received {new Date(inquiry.created_at).toLocaleString()}
          </p>
        </div>
        <Badge variant={inquiry.status === "open" ? "default" : "secondary"}>
          {inquiry.status === "open" ? "Open" : "Closed"}
        </Badge>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Customer details</h2>
            </div>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Full name</p>
                <p className="mt-1">{customerName}</p>
              </div>
              {company && (
                <div>
                  <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Building2 className="h-3 w-3" /> Company
                  </p>
                  <p className="mt-1">{company}</p>
                </div>
              )}
              <div>
                <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Mail className="h-3 w-3" /> Email
                </p>
                <p className="mt-1 break-all">{inquiry.customer_email ?? readableValue(customerDetails.email) ?? "—"}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Phone className="h-3 w-3" /> Phone
                </p>
                <p className="mt-1">{inquiry.customer_phone ?? readableValue(customerDetails.phone) ?? "—"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <MapPin className="h-3 w-3" /> Address
                </p>
                <p className="mt-1">{address || "—"}</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Product information</h2>
            </div>
            <div className="mt-4 flex gap-4">
              {product?.images?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.images[0]}
                  alt=""
                  className="h-20 w-20 rounded-md border border-border object-cover"
                />
              )}
              <div className="min-w-0 space-y-1 text-sm">
                <p className="font-medium">{requestedProductName}</p>
                {product?.sku && <p className="text-muted-foreground">SKU: {product.sku}</p>}
                {product?.price != null && (
                  <p className="text-muted-foreground">
                    Listed price: {product.price} {product.currency}
                  </p>
                )}
                {productUrl && (
                  <a
                    href={productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 break-all text-primary hover:underline"
                  >
                    View product URL <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold">Price on Request form</h2>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Requested quantity</p>
                <p className="mt-1">
                  {inquiry.requested_quantity ?? readableValue(details.quantity) ?? "—"}
                </p>
              </div>
              {formRows.map((row) => (
                <div key={row.label}>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{row.label}</p>
                  <p className="mt-1 whitespace-pre-wrap">{row.value}</p>
                </div>
              ))}
              <div className="sm:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer message</p>
                <p className="mt-1 whitespace-pre-wrap">{inquiry.message || "—"}</p>
              </div>
            </div>
          </section>
        </div>

        <InquiryManagementPanel
          inquiryId={inquiry.id}
          status={inquiry.status}
          initialNotes={inquiry.admin_notes ?? ""}
        />
      </div>
    </div>
  );
}
