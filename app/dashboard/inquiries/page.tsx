import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleStatusButton } from "@/app/dashboard/inquiries/toggle-status-button";
import { DeleteInquiryButton } from "@/app/dashboard/inquiries/delete-inquiry-button";
import type { Inquiry, Product } from "@/lib/types";

export default async function InquiriesPage() {
  const store = await getCurrentStore();
  const { data: inquiries } = await supabaseAdmin
    .from("inquiries")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  const items = (inquiries ?? []) as Inquiry[];
  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[];

  const { data: products } = productIds.length
    ? await supabaseAdmin.from("products").select("id, name").in("id", productIds)
    : { data: [] as Pick<Product, "id" | "name">[] };

  const productNameById = new Map((products ?? []).map((p) => [p.id, p.name]));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Inquiries</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Customer requests and orders from your storefront
      </p>

      <div className="mt-6 space-y-3">
        {items.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No inquiries yet. They&apos;ll show up here once customers submit
              requests on your storefront.
            </CardContent>
          </Card>
        )}
        {items.map((inquiry) => (
          <Card key={inquiry.id}>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{inquiry.customer_name || "Anonymous"}</p>
                  <Badge variant={inquiry.status === "open" ? "default" : "secondary"}>
                    {inquiry.status === "open" ? "Open" : "Closed"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {[inquiry.customer_email, inquiry.customer_phone].filter(Boolean).join(" · ")}
                </p>
                {inquiry.product_id && (
                  <p className="text-sm text-muted-foreground">
                    Re: {productNameById.get(inquiry.product_id) ?? "Unknown product"}
                  </p>
                )}
                {inquiry.message && <p className="mt-2 text-sm">{inquiry.message}</p>}
                <p className="text-xs text-muted-foreground">
                  {new Date(inquiry.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ToggleStatusButton inquiryId={inquiry.id} status={inquiry.status} />
                <DeleteInquiryButton inquiryId={inquiry.id} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
