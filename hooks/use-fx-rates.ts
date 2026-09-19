'use client';

import { useEffect, useState } from 'react';
import { FX_QUOTE_CODES, type FxPayload, type FxQuoteCode } from '@/lib/fx';

const REFRESH_MS = 60 * 60 * 1000;

export function useFxRates() {
  const [rates, setRates] = useState<Partial<Record<FxQuoteCode, number>> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch('/api/fx', { cache: 'force-cache' });
        if (!response.ok) return;
        const payload = (await response.json()) as FxPayload;
        if (!active || !payload.rates) return;
        const next: Partial<Record<FxQuoteCode, number>> = {};
        for (const code of FX_QUOTE_CODES) {
          const value = payload.rates[code];
          if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            next[code] = value;
          }
        }
        if (Object.keys(next).length === 0) return;
        setRates(next);
        setUpdatedAt(payload.updatedAt);
      } catch {
        // Clock chrome stays usable if FX is down.
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return { rates, updatedAt, loading, quotes: FX_QUOTE_CODES };
}
