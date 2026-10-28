import type { Metadata } from 'next';
import { MobileAppShell } from '@/components/mobile/mobile-app-shell';
import { Suspense } from 'react';
import { InquiryReferralCapture } from '@/components/public/inquiry-referral-capture';

/** Native/mobile shell routes duplicate public catalog content and should never compete in search. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <MobileAppShell><Suspense fallback={null}><InquiryReferralCapture /></Suspense>{children}</MobileAppShell>;
}
