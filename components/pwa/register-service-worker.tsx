'use client';

import { useEffect } from 'react';

export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const isLocal =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (process.env.NODE_ENV !== 'production' && !isLocal) return;

    let cancelled = false;

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
      } catch {
        // Installability still works from the manifest even if SW registration fails.
      }
    };

    if (!cancelled) {
      void register();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
