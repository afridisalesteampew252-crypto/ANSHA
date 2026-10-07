'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin dashboard render error:', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
      <div className="w-full rounded-2xl border border-destructive/25 bg-destructive/[0.04] p-6 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Dashboard could not load</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The rest of Admin is still available. Retry the dashboard, or continue to another Admin section.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="accent" onClick={() => reset()}>
            <RotateCcw className="h-4 w-4" />
            Retry dashboard
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/vehicles">Open vehicles</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/customers">Open customers</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
