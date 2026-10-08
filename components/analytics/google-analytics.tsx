'use client';

import { useEffect } from 'react';
import { useCookieConsent } from '@/components/privacy/cookie-consent';

export function GoogleAnalytics() {
  const { choices } = useCookieConsent();
  useEffect(() => {
    if (!choices) return;
    const analyticsWindow = window as Window & {
      gtag?: (...args: unknown[]) => void;
    };
    analyticsWindow.gtag?.('consent', 'update', {
      analytics_storage: choices.analytics ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }, [choices]);
  return null;
}
