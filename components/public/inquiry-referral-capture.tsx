'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getBrowserInquiryReferral } from '@/lib/inquiry-referral';

/** Capture navigation referrals without creating a lead or sending any tracking request. */
export function InquiryReferralCapture() {
  const searchParams = useSearchParams();
  const referral = searchParams.get('ref');
  useEffect(() => { getBrowserInquiryReferral(); }, [referral]);
  return null;
}
