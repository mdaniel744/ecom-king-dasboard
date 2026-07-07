import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { BrandMark } from "@/components/dashboard/brand-mark";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { UserButton } from "@/components/dashboard/user-button";
import { getCurrentStore } from "@/lib/get-current-store";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [store, supabase] = await Promise.all([
    getCurrentStore(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
        <UserButton email={user?.email ?? ""} />
      </header>

      {/* Main content */}
      <main className="min-h-[calc(100vh-3.5rem)] p-4 md:ml-64 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
