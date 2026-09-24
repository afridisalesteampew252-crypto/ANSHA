'use client';

import { useEffect } from 'react';

/** Bridges ansha://auth/callback links back into the live app route. */
export function NativeAppUrlHandler() {
  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | undefined;

    void import('@capacitor/app')
      .then(async ({ App }) => {
        if (cancelled) return;
        const handle = await App.addListener('appUrlOpen', ({ url }) => {
          try {
            const deepLink = new URL(url);
            if (deepLink.protocol !== 'ansha:' || deepLink.hostname !== 'auth' || deepLink.pathname !== '/callback') return;
            const callback = new URL('/auth/callback', window.location.origin);
            callback.search = deepLink.search;
            window.location.assign(callback.toString());
          } catch {
            // Ignore unrelated or malformed external links.
          }
        });
        removeListener = () => handle.remove();
      })
      .catch(() => {
        // The browser does not expose the Capacitor bridge; no-op by design.
      });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  return null;
}
