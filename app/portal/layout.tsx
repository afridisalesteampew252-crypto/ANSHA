import { GoogleAnalytics } from '@/components/analytics/google-analytics';

/** Portal shares the production origin; load GA here (not /admin). */
export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <GoogleAnalytics />
    </>
  );
}
