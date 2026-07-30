import Link from "next/link";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DealerApplicationActions } from "@/app/dashboard/dealer-applications/dealer-application-actions";
import type { DealerApplication, DealerApplicationStatus } from "@/lib/types";

const TABS: { label: string; value: DealerApplicationStatus | "all" }[] = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "All", value: "all" },
];

const STATUS_BADGE: Record<DealerApplicationStatus, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

export default async function DealerApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: rawStatus } = await searchParams;
  const activeTab = (["pending", "approved", "rejected", "all"] as const).includes(rawStatus as never)
    ? (rawStatus as DealerApplicationStatus | "all")
    : "pending";

  const store = await getCurrentStore();
  let query = supabaseAdmin
    .from("dealer_applications")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  if (activeTab !== "all") {
    query = query.eq("status", activeTab);
  }

  const { data: applications } = await query;
  const items = (applications ?? []) as DealerApplication[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dealer Applications</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Applications submitted from your storefront — no need to create these manually
      </p>

      <div className="mt-4 flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/dashboard/dealer-applications?status=${tab.value}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {items.length === 0 && (
          <div className="rounded-lg border border-border bg-card py-10 text-center text-muted-foreground">
            No applications found.
          </div>
        )}
        {items.map((app) => (
          <div key={app.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{app.company_name}</p>
                <p className="text-sm text-muted-foreground">{app.contact_email}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={STATUS_BADGE[app.status]}>{app.status}</Badge>
                {app.status === "pending" && <DealerApplicationActions applicationId={app.id} />}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              {app.phone && <p>Phone: <span className="text-foreground">{app.phone}</span></p>}
              {app.tax_id && <p>Tax ID: <span className="text-foreground">{app.tax_id}</span></p>}
              {app.website && <p>Website: <span className="text-foreground">{app.website}</span></p>}
              {app.address && <p className="sm:col-span-2">Address: <span className="text-foreground">{app.address}</span></p>}
              {app.country && <p>Country: <span className="text-foreground">{app.country}</span></p>}
            </div>
            {app.message && (
              <p className="mt-3 rounded bg-muted/50 p-2 text-sm text-muted-foreground">{app.message}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
