'use client';

import { PageErrorFallback } from '@/components/errors/page-error-fallback';

export default function AdminPageError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageErrorFallback retry={retry} title="This admin page could not be loaded" description="The admin menu is still available. Retry this page, reload, or return to the dashboard." href="/admin/dashboard" linkLabel="Open dashboard" />;
}
