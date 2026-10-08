'use client';

import { PageErrorFallback } from '@/components/errors/page-error-fallback';

export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageErrorFallback retry={retry} title="Admin could not be loaded" description="Please retry or reload. You can return to staff sign in to open a fresh session." href="/admin" linkLabel="Staff sign in" fullPage />;
}
