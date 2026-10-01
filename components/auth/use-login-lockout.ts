'use client';

import { useCallback, useEffect, useState } from 'react';

const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000;
const STORAGE_PREFIX = 'ansha.auth-lockout.v1';

type FailureState = {
  attempts: number;
  windowStartedAt: number;
  lockedUntil: number;
};

const emptyState: FailureState = { attempts: 0, windowStartedAt: 0, lockedUntil: 0 };
const fallbackStorage = new Map<string, string>();

function hashIdentifier(scope: string, email: string) {
  const value = `${scope}:${email.trim().toLowerCase()}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}

function readStoredValue(key: string) {
  if (typeof window === 'undefined') return fallbackStorage.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return fallbackStorage.get(key) ?? null;
  }
}

function writeStoredValue(key: string, value: string) {
  fallbackStorage.set(key, value);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep the current tab protected when browser storage is unavailable.
  }
}

function removeStoredValue(key: string) {
  fallbackStorage.delete(key);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // The in-memory fallback is cleared even when browser storage is unavailable.
  }
}

function readState(key: string): FailureState {
  const stored = readStoredValue(key);
  if (!stored) return emptyState;

  try {
    const parsed = JSON.parse(stored) as Partial<FailureState>;
    const state = {
      attempts: Number(parsed.attempts) || 0,
      windowStartedAt: Number(parsed.windowStartedAt) || 0,
      lockedUntil: Number(parsed.lockedUntil) || 0,
    };
    const now = Date.now();

    if (state.lockedUntil > now) return state;
    if (!state.windowStartedAt || now - state.windowStartedAt >= LOCKOUT_WINDOW_MS) {
      removeStoredValue(key);
      return emptyState;
    }

    return state;
  } catch {
    removeStoredValue(key);
    return emptyState;
  }
}

export function useLoginLockout(scope: 'admin' | 'customer', email: string) {
  const key = `${STORAGE_PREFIX}.${hashIdentifier(scope, email)}`;
  const [state, setState] = useState<FailureState>(() => readState(key));

  const refresh = useCallback(() => {
    const next = readState(key);
    setState((current) => (
      current.attempts === next.attempts
      && current.windowStartedAt === next.windowStartedAt
      && current.lockedUntil === next.lockedUntil
        ? current
        : next
    ));
    return next;
  }, [key]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === key) refresh();
    };

    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', onStorage);
    };
  }, [key, refresh]);

  const recordFailure = useCallback(() => {
    const previous = readState(key);
    const now = Date.now();
    if (previous.lockedUntil > now) {
      setState(previous);
      return previous;
    }

    const inCurrentWindow = previous.windowStartedAt > 0
      && now - previous.windowStartedAt < LOCKOUT_WINDOW_MS;
    const attempts = inCurrentWindow ? previous.attempts + 1 : 1;
    const next: FailureState = {
      attempts,
      windowStartedAt: inCurrentWindow ? previous.windowStartedAt : now,
      lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_WINDOW_MS : 0,
    };

    writeStoredValue(key, JSON.stringify(next));
    setState(next);
    return next;
  }, [key]);

  const clearFailures = useCallback(() => {
    removeStoredValue(key);
    setState(emptyState);
  }, [key]);

  return {
    attempts: state.attempts,
    lockedUntil: state.lockedUntil,
    secondsRemaining: Math.max(0, Math.ceil((state.lockedUntil - Date.now()) / 1000)),
    refresh,
    recordFailure,
    clearFailures,
  };
}
