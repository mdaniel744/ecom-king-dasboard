import Link from "next/link";
import { Package, CheckCircle2, FileText, Clock, ArrowRight } from "lucide-react";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Inquiry, Product } from "@/lib/types";

async function getDashboardData(storeId: string) {
  const [{ data: statsRows }, { data: recentInquiries }, { data: recentProducts }] =
    await Promise.all([
      supabaseAdmin.rpc("get_dashboard_stats", { p_store_id: storeId }),
      supabaseAdmin
        .from("inquiries")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("products")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const stats = statsRows?.[0];

  return {
    totalProducts: stats?.total_products ?? 0,
    activeProducts: stats?.active_products ?? 0,
    totalInquiries: stats?.total_inquiries ?? 0,
    openInquiries: stats?.open_inquiries ?? 0,
    recentInquiries: (recentInquiries ?? []) as Inquiry[],
    recentProducts: (recentProducts ?? []) as Product[],
  };
}

export default async function DashboardPage() {
  const store = await getCurrentStore();
  const stats = await getDashboardData(store.id);

  const statCards = [
    { label: "Total Products", value: stats.totalProducts, icon: Package },
    { label: "Active", value: stats.activeProducts, icon: CheckCircle2 },
    { label: "Total Inquiries", value: stats.totalInquiries, icon: FileText },
    { label: "Open Inquiries", value: stats.openInquiries, icon: Clock },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Overview of {store.name}&apos;s products and inquiries
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-2xl font-semibold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
                <stat.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Inquiries</CardTitle>
            <Link
              href="/dashboard/inquiries"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {stats.recentInquiries.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No inquiries yet
              </p>
            )}
            {stats.recentInquiries.map((inquiry) => (
              <div
                key={inquiry.id}
                className="flex items-center justify-between rounded-md px-2 py-2.5 hover:bg-accent"
              >
                <div>
                  <p className="text-sm font-medium">
                    {inquiry.customer_name || "Anonymous"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inquiry.customer_email}
                  </p>
                </div>
                <Badge variant={inquiry.status === "open" ? "default" : "secondary"}>
                  {inquiry.status === "open" ? "Open" : "Closed"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Products</CardTitle>
            <Link
              href="/dashboard/products"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {stats.recentProducts.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No products yet
              </p>
            )}
            {stats.recentProducts.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between rounded-md px-2 py-2.5 hover:bg-accent"
              >
                <div>
                  <p className="text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {product.price != null
                      ? `from ${product.currency} ${product.price}`
                      : "No price set"}
                  </p>
                </div>
                <Badge variant={product.status === "active" ? "default" : "secondary"}>
                  {product.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
