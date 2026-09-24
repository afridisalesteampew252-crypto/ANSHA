'use client';

import { useEffect } from 'react';

/**
 * Capacitor-only Android back handling. On the web this component is inert, so
 * desktop and mobile browser navigation keep their normal browser behavior.
 */
export function NativeBackHandler() {
  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let cancelled = false;

    void import('@capacitor/app')
      .then(({ App }) => {
        if (cancelled) return;
        return App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack || window.history.length > 1) {
            window.history.back();
          } else {
            void App.exitApp();
          }
        }).then((handle) => {
          removeListener = () => handle.remove();
        });
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
