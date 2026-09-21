import { GoogleTagManager } from '@/components/analytics/google-tag-manager';

/** Portal shares the production origin; load GTM here (not /admin). */
export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GoogleTagManager />
      {children}
    </>
  );
}
