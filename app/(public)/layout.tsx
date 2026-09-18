import { InstallPrompt } from '@/components/pwa/install-prompt';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { MobileBottomNav } from '@/components/public/mobile-bottom-nav';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="min-w-0 flex-1 overflow-x-clip pb-16 lg:pb-0">{children}</main>
      <SiteFooter />
      <MobileBottomNav />
      <InstallPrompt />
    </div>
  );
}
