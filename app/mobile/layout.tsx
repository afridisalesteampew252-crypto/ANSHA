import { MobileAppShell } from '@/components/mobile/mobile-app-shell';
import { Suspense } from 'react';
import { InquiryReferralCapture } from '@/components/public/inquiry-referral-capture';

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <MobileAppShell><Suspense fallback={null}><InquiryReferralCapture /></Suspense>{children}</MobileAppShell>;
}
