import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { BrandMark } from "@/components/dashboard/brand-mark";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { UserButton } from "@clerk/nextjs";
import { getCurrentStore } from "@/lib/get-current-store";
import { isLocalDemoMode } from "@/lib/local-demo";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await getCurrentStore();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border px-4 py-4">
          <BrandMark storeName={store.name} />
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <DashboardNav />
        </div>
      </aside>

      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:ml-64">
        <MobileSidebar storeName={store.name} />
        <div className="flex-1" />
        {isLocalDemoMode ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
            Local demo
          </span>
        ) : (
          <UserButton />
        )}
      </header>

      {/* Main content */}
      <main className="min-h-[calc(100vh-3.5rem)] p-4 md:ml-64 md:p-6 lg:p-8">
        {isLocalDemoMode && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <span className="font-medium">Local demo mode:</span> sample navigation is available,
            but database changes are not persisted. Add Supabase credentials and disable
            LOCAL_DEMO_MODE to use real store data.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
