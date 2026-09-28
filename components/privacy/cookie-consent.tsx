'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'ansha-cookie-consent-v1';
const OPEN_EVENT = 'ansha-open-cookie-settings';

export type CookieChoices = { analytics: boolean; functional: boolean };
type CookieConsentContextValue = {
  choices: CookieChoices | null;
  openSettings: () => void;
};
const CookieConsentContext = createContext<CookieConsentContextValue>({
  choices: null,
  openSettings: () => undefined,
});

export function useCookieConsent() {
  return useContext(CookieConsentContext);
}

export function CookieSettingsButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
    >
      Cookie settings
    </button>
  );
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [choices, setChoices] = useState<CookieChoices | null>(null);
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [draft, setDraft] = useState<CookieChoices>({ analytics: false, functional: false });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<CookieChoices>;
        const next = { analytics: parsed.analytics === true, functional: parsed.functional === true };
        setChoices(next);
        setDraft(next);
        setOpen(false);
      } else {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
    const show = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        const parsed = saved ? JSON.parse(saved) as Partial<CookieChoices> : {};
        setDraft({ analytics: parsed.analytics === true, functional: parsed.functional === true });
      } catch {
        setDraft({ analytics: false, functional: false });
      }
      setManage(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  const save = useCallback((next: CookieChoices) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setChoices(next);
    setOpen(false);
    setManage(false);
    window.location.reload();
  }, []);

  const value = useMemo(() => ({ choices, openSettings: () => setOpen(true) }), [choices]);

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
      {open ? (
        <aside
          role="dialog"
          aria-label="Cookie and technology choices"
          aria-modal="false"
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-xl border border-border bg-background p-4 text-foreground shadow-2xl sm:inset-x-6 sm:bottom-6 sm:p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <h2 className="font-semibold">Your privacy choices</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Essential storage keeps the site and sign-in working. With your choice, we can also load analytics and the Tawk.to support chat. Change this later in Cookie settings.
              </p>
              <a href="/cookie-policy" className="mt-1 inline-block text-sm text-accent underline">Cookie policy</a>
              {manage ? (
                <div className="mt-3 grid gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.analytics} onChange={(e) => setDraft((v) => ({ ...v, analytics: e.target.checked }))} />
                    Allow analytics and performance measurement
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.functional} onChange={(e) => setDraft((v) => ({ ...v, functional: e.target.checked }))} />
                    Allow Tawk.to support chat technologies
                  </label>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {manage ? (
                <>
                  <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => save(draft)}>Save choices</button>
                  <button type="button" className="rounded-md px-3 py-2 text-sm text-muted-foreground" onClick={() => setManage(false)}>Back</button>
                </>
              ) : (
                <>
                  <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => setManage(true)}>Manage</button>
                  <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => save({ analytics: false, functional: false })}>Essential only</button>
                  <button type="button" className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white" onClick={() => save({ analytics: true, functional: true })}>Accept all</button>
                </>
              )}
            </div>
          </div>
        </aside>
      ) : null}
    </CookieConsentContext.Provider>
  );
}
