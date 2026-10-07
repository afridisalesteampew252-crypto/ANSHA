import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-28 animate-pulse rounded-2xl border border-border/80 bg-secondary/30" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border border-border/80 bg-secondary/20" />
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading dashboard data…
      </div>
    </div>
  );
}
