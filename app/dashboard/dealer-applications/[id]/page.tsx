import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  Mail,
  MapPin,
  Package,
  Phone,
  ShoppingBag,
} from "lucide-react";
import { getCurrentStore } from "@/lib/get-current-store";
import { getKarivUsersByIds } from "@/lib/kariv-clerk";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DealerApplicationActions } from "@/app/dashboard/dealer-applications/dealer-application-actions";
import type { DealerApplication, DealerApplicationStatus, Order, Product } from "@/lib/types";

const STATUS_BADGE: Record<DealerApplicationStatus, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

function formatDate(value: string | null) {
  if (!value) return "Not reviewed yet";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

function formatPrice(product: Product) {
  if (product.price == null) return "Not set";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: product.currency || "USD",
    }).format(product.price);
  } catch {
    return `${product.currency || "USD"} ${product.price}`;
  }
}

export default async function DealerApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = await getCurrentStore();
  const { data: applicationData } = await supabaseAdmin
    .from("dealer_applications")
    .select("*")
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();

  if (!applicationData) notFound();
  const application = applicationData as DealerApplication;

  const [{ data: listingData, error: listingError }, { data: orderData }, dealerUsers] =
    await Promise.all([
      supabaseAdmin
        .from("products")
        .select("*")
        .eq("store_id", store.id)
        .eq("dealer_user_id", application.dealer_user_id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("orders")
        .select("*")
        .eq("store_id", store.id)
        .eq("dealer_user_id", application.dealer_user_id)
        .order("created_at", { ascending: false }),
      getKarivUsersByIds([application.dealer_user_id]),
    ]);

  const listings = listingError ? [] : ((listingData ?? []) as Product[]);
  const dealerOrders = (orderData ?? []) as Order[];
  const completedOrders = dealerOrders.filter((order) =>
    (["verified", "funds_released"] as Order["escrow_status"][]).includes(order.escrow_status)
  );
  const soldListings = completedOrders.reduce(
    (total, order) =>
      total + order.products.reduce((orderTotal, product) => orderTotal + (product.quantity || 1), 0),
    0
  );
  const activeListings = listings.filter((product) => product.status === "active").length;
  const dealerUser = dealerUsers.get(application.dealer_user_id);

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href="/dashboard/dealer-applications" aria-label="Back to dealer management">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{application.company_name}</h1>
              <Badge variant={STATUS_BADGE[application.status]} className="capitalize">
                {application.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Dealer application and marketplace performance profile
            </p>
          </div>
        </div>
        <DealerApplicationActions applicationId={application.id} status={application.status} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total listings", value: listings.length, icon: Package },
          { label: "Published / active", value: activeListings, icon: CheckCircle2 },
          { label: "Listings sold", value: soldListings, icon: ShoppingBag },
          { label: "Completed orders", value: completedOrders.length, icon: Building2 },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <stat.icon className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {listingError && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Dealer listing ownership is not connected in this database yet. Run the dealer management
          migration to enable listing totals.
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dealer profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="flex gap-3">
              <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Contact name</p>
                <p className="font-medium">{dealerUser?.name || application.company_name}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <a href={`mailto:${dealerUser?.email || application.contact_email}`} className="font-medium hover:text-primary">
                  {dealerUser?.email || application.contact_email}
                </a>
              </div>
            </div>
            <div className="flex gap-3">
              <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="font-medium">{application.phone || "Not provided"}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="font-medium">
                  {[application.address, application.country].filter(Boolean).join(", ") || "Not provided"}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tax / registration ID</p>
              <p className="mt-1 font-medium">{application.tax_id || "Not provided"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dealer user ID</p>
              <p className="mt-1 break-all font-mono text-xs">{application.dealer_user_id}</p>
            </div>
            {application.website && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Website</p>
                <a
                  href={application.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {application.website}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Submitted</p>
              <p className="mt-1 font-medium">{formatDate(application.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last decision</p>
              <p className="mt-1 font-medium">{formatDate(application.reviewed_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Applicant message</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 leading-relaxed">
                {application.message || "No additional message was supplied."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Dealer listings</h2>
            <p className="text-sm text-muted-foreground">
              Products published or prepared by this dealer.
            </p>
          </div>
          <Badge variant="outline">{listings.length} total</Badge>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                    This dealer has not published any listings yet.
                  </TableCell>
                </TableRow>
              ) : (
                listings.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.sku || product.slug}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.status === "active" ? "default" : "secondary"} className="capitalize">
                        {product.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatPrice(product)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(product.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/products/${product.id}/edit`}>Manage listing</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
