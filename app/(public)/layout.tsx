import { InstallPrompt } from '@/components/pwa/install-prompt';
import { PushOptIn } from '@/components/pwa/push-opt-in';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { MobileBottomNav } from '@/components/public/mobile-bottom-nav';
import { TawkToChat } from '@/components/public/tawk-to-chat';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-marketing flex min-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-clip">
      <SiteHeader />
      <main className="min-w-0 max-w-full flex-1 overflow-x-clip">
        {children}
      </main>
      <SiteFooter />
      <MobileBottomNav />
      <InstallPrompt />
      <PushOptIn />
      <TawkToChat />
      <GoogleAnalytics />
    </div>
  );
}
