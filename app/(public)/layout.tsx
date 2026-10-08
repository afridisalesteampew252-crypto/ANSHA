import { InstallPrompt } from '@/components/pwa/install-prompt';
import { PushOptIn } from '@/components/pwa/push-opt-in';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { MobileBottomNav } from '@/components/public/mobile-bottom-nav';
import { TawkToChat } from '@/components/public/tawk-to-chat';
import { GoogleTagManager } from '@/components/analytics/google-tag-manager';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { siteConfig } from '@/lib/site-config';
import { VercelMetrics } from '@/components/analytics/vercel-metrics';
import { CookieConsentProvider } from '@/components/privacy/cookie-consent';
import { Suspense } from 'react';
import { InquiryReferralCapture } from '@/components/public/inquiry-referral-capture';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CookieConsentProvider>
      <script
        id="google-analytics-loader"
        defer
        src={`https://www.googletagmanager.com/gtag/js?id=${siteConfig.googleAnalyticsId}`}
      />
      <Suspense fallback={null}><InquiryReferralCapture /></Suspense>
      <div className="public-marketing flex min-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-clip pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <GoogleTagManager />
        <GoogleAnalytics />
        <VercelMetrics />
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="min-w-0 max-w-full flex-1 overflow-x-clip">
          {children}
        </main>
        <SiteFooter />
        <MobileBottomNav />
        <InstallPrompt />
        <PushOptIn />
        <TawkToChat />
      </div>
    </CookieConsentProvider>
  );
}
