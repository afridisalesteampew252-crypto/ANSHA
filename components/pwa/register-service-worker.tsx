'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { isNativeCapacitorRuntime } from '@/lib/capacitor/runtime';

function trackWaiting(registration: ServiceWorkerRegistration, setWaiting: (sw: ServiceWorker | null) => void) {
  if (registration.waiting) {
    setWaiting(registration.waiting);
    return;
  }

  const worker = registration.installing;
  if (!worker) return;

  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      setWaiting(registration.waiting);
    }
  });
}

export function RegisterServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (isNativeCapacitorRuntime()) return;

    if (process.env.NODE_ENV !== 'production') return;

    let reloaded = false;
    let hadController = Boolean(navigator.serviceWorker.controller);

    const onControllerChange = () => {
      // The first install claims this tab; reloading then loses typed searches,
      // open menus and sign-in feedback. Reload only when an existing worker
      // is replaced by an update.
      if (!hadController) { hadController = true; return; }
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });

        trackWaiting(registration, setWaiting);
        registration.addEventListener('updatefound', () => trackWaiting(registration, setWaiting));
      } catch {
        // Installability still works from the manifest even if SW registration fails.
      }
    };

    void register();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 border-b bg-background/95 px-3 py-2 text-sm shadow-sm backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <span>Update available</span>
      <Button
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}
      >
        Refresh
      </Button>
    </div>
  );
}
