'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { useCookieConsent } from '@/components/privacy/cookie-consent';

/** Usage and performance measurement are optional and start only after consent. */
export function VercelMetrics() {
  const { choices } = useCookieConsent();
  if (!choices?.analytics) return null;
  return <><Analytics /><SpeedInsights /></>;
}
