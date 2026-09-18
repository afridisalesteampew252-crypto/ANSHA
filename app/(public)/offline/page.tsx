import Link from 'next/link';
import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-secondary text-muted-foreground">
        <WifiOff className="h-7 w-7" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">You are offline</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        ANSHA catalog pages need a connection. Reconnect, then refresh. Staff login and ERP are never cached offline.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
