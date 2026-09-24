import { MobileAppShell } from '@/components/mobile/mobile-app-shell';

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <MobileAppShell>{children}</MobileAppShell>;
}
