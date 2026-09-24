'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { isNativeCapacitorRuntime } from '@/lib/capacitor/runtime';

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'ansha-pwa-install-dismissed';

type InstallStore = {
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
  dismissed: boolean;
};

let store: InstallStore = {
  deferred: null,
  installed: false,
  dismissed: false,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setStore(partial: Partial<InstallStore>) {
  store = { ...store, ...partial };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return store;
}

function getServerSnapshot(): InstallStore {
  return { deferred: null, installed: false, dismissed: false };
}

function detectInstalled() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function detectIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return iOS && !detectInstalled();
}

let listening = false;

function ensureGlobalListener() {
  if (typeof window === 'undefined' || listening) return;
  listening = true;

  setStore({
    installed: detectInstalled(),
    dismissed: localStorage.getItem(DISMISS_KEY) === '1',
  });

  const onPrompt = (event: Event) => {
    event.preventDefault();
    setStore({ deferred: event as BeforeInstallPromptEvent });
  };

  const onInstalled = () => {
    setStore({ deferred: null, installed: true });
  };

  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
}

export function usePwaInstall() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isIos, setIsIos] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    const isNative = isNativeCapacitorRuntime();
    setNative(isNative);
    if (isNative) return;
    ensureGlobalListener();
    setIsIos(detectIos());
  }, []);

  const dismissBanner = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, '1');
    setStore({ dismissed: true });
  }, []);

  const clearDismiss = useCallback(() => {
    localStorage.removeItem(DISMISS_KEY);
    setStore({ dismissed: false });
  }, []);

  const promptInstall = useCallback(async () => {
    const deferred = store.deferred;
    if (!deferred) return { outcome: 'unavailable' as const };
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') {
      setStore({ deferred: null, installed: true });
    }
    return { outcome: choice.outcome };
  }, []);

  return {
    native,
    canNativePrompt: Boolean(snapshot.deferred) && !snapshot.installed,
    deferred: snapshot.deferred,
    installed: snapshot.installed,
    dismissed: snapshot.dismissed,
    isIos,
    showManualHint: !snapshot.installed && !snapshot.deferred,
    promptInstall,
    dismissBanner,
    clearDismiss,
  };
}
