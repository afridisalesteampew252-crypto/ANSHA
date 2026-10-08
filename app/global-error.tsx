'use client';

import { PageErrorFallback } from '@/components/errors/page-error-fallback';

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <head><title>Page unavailable — ANSHA</title></head>
      <body style={{ margin: 0, background: '#fafafa' }}>
        <PageErrorFallback retry={retry} fullPage />
      </body>
    </html>
  );
}
