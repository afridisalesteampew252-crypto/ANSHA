'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export type FinanceSettings = { default_currency: string; enabled_currencies: string[] };
export const FALLBACK_FINANCE_SETTINGS: FinanceSettings = {
  default_currency: 'AED',
  enabled_currencies: ['AED', 'USD', 'PKR', 'JPY', 'EUR', 'GBP'],
};

export function useFinanceSettings() {
  const [settings, setSettings] = useState<FinanceSettings>(FALLBACK_FINANCE_SETTINGS);
  useEffect(() => {
    let active = true;
    void supabase.from('system_finance_settings').select('default_currency,enabled_currencies').eq('id', 1).maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        const enabled = data.enabled_currencies.filter((code: string) => /^[A-Z]{3}$/.test(code));
        if (enabled.length && enabled.includes(data.default_currency)) {
          setSettings({ default_currency: data.default_currency, enabled_currencies: enabled });
        }
      });
    return () => { active = false; };
  }, []);
  return settings;
}
