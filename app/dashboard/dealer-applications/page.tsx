import Link from "next/link";
import { Eye } from "lucide-react";
import { getCurrentStore } from "@/lib/get-current-store";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DealerApplicationActions } from "@/app/dashboard/dealer-applications/dealer-application-actions";
import type { DealerApplication, DealerApplicationStatus } from "@/lib/types";

const TABS: { label: string; value: DealerApplicationStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

const STATUS_BADGE: Record<DealerApplicationStatus, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export default async function DealerApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: rawStatus } = await searchParams;
  const activeTab = (["pending", "approved", "rejected", "all"] as const).includes(rawStatus as never)
    ? (rawStatus as DealerApplicationStatus | "all")
    : "all";

  const store = await getCurrentStore();
  const { data: applications } = await supabaseAdmin
    .from("dealer_applications")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  const allApplications = (applications ?? []) as DealerApplication[];
  const items =
    activeTab === "all"
      ? allApplications
      : allApplications.filter((application) => application.status === activeTab);
  const counts = {
    all: allApplications.length,
    pending: allApplications.filter((application) => application.status === "pending").length,
    approved: allApplications.filter((application) => application.status === "approved").length,
    rejected: allApplications.filter((application) => application.status === "rejected").length,
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dealer Management</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Review dealership requests, make quick decisions, and open each dealer profile for deeper management.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/dashboard/dealer-applications?status=${tab.value}`}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px]",
                activeTab === tab.value ? "bg-white/20" : "bg-background"
              )}
            >
              {counts[tab.value]}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border bg-card">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>Dealer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Quick actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No dealer requests found in this section.
                </TableCell>
              </TableRow>
            ) : (
              items.map((application) => (
                <TableRow key={application.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/dealer-applications/${application.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {application.company_name}
                    </Link>
                    <p className="mt-0.5 max-w-[260px] truncate text-xs text-muted-foreground">
                      {application.tax_id ? `Tax ID: ${application.tax_id}` : "Tax ID not provided"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{application.contact_email}</p>
                    <p className="text-xs text-muted-foreground">{application.phone || "No phone"}</p>
                  </TableCell>
                  <TableCell>
                    <p>{application.country || "Not provided"}</p>
                    <p className="max-w-[180px] truncate text-xs text-muted-foreground">
                      {application.address || "No address"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(application.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[application.status]} className="capitalize">
                      {application.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <DealerApplicationActions
                        applicationId={application.id}
                        status={application.status}
                      />
                      <Button asChild size="sm" variant="ghost" className="h-8">
                        <Link href={`/dashboard/dealer-applications/${application.id}`}>
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          Open
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
