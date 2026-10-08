'use client';

import { PageErrorFallback } from '@/components/errors/page-error-fallback';

export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageErrorFallback retry={retry} fullPage />;
}
