import { AppHeader } from "@/components/layout/app-header";
import { HostListSkeleton } from "@/components/dashboard/host-list-skeleton";

export default function DashboardLoading() {
  return (
    <AppHeader>
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-10 md:py-12">
        <div className="mb-8">
          <div className="skeleton-line mb-2 h-8 w-40" />
          <div className="skeleton-line h-4 w-64" />
        </div>
        <HostListSkeleton />
      </main>
    </AppHeader>
  );
}
