'use client';

import * as React from 'react';
import { useEffect } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { supabase } from '@/lib/supabase/client';
import {
  applyBrandAccentColor,
  persistBrandAccentColor,
  readCachedBrandAccentColor,
} from '@/lib/brand-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const cached = readCachedBrandAccentColor();
    if (cached) applyBrandAccentColor(cached.color);
    if (cached?.isFresh) return;

    let active = true;
    void (async () => {
      const { data } = await supabase
        .from('site_trade_settings')
        .select('brand_accent_color')
        .eq('id', 1)
        .maybeSingle();
      if (active && data?.brand_accent_color) {
        persistBrandAccentColor(data.brand_accent_color);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
