import type { Metadata } from 'next';
import { GoogleTagManager } from '@/components/analytics/google-tag-manager';
import { TawkToChat } from '@/components/public/tawk-to-chat';
import { VercelMetrics } from '@/components/analytics/vercel-metrics';
import { CookieConsentProvider } from '@/components/privacy/cookie-consent';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Portal shares the production origin; optional analytics/chat wait for consent. */
export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <CookieConsentProvider>
      <GoogleTagManager />
      <VercelMetrics />
      <TawkToChat />
      {children}
    </CookieConsentProvider>
  );
}
