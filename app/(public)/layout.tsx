import { InstallPrompt } from '@/components/pwa/install-prompt';
import { PushOptIn } from '@/components/pwa/push-opt-in';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { MobileBottomNav } from '@/components/public/mobile-bottom-nav';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-marketing flex min-h-dvh min-w-0 max-w-full flex-col">
      <SiteHeader />
      <main className="min-w-0 max-w-full flex-1 overflow-x-clip pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        {children}
      </main>
      <SiteFooter />
      <MobileBottomNav />
      <InstallPrompt />
      <PushOptIn />
    </div>
  );
}
