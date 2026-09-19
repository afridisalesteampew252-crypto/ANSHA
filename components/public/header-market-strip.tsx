'use client';

import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const QUOTE_CODES = ['USD', 'EUR', 'JPY', 'PKR'] as const;
type QuoteCode = (typeof QUOTE_CODES)[number];

type FxPayload = {
  base: string;
  rates: Partial<Record<QuoteCode, number>> | null;
  updatedAt?: string;
};

function formatDubaiTime(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatRate(code: QuoteCode, value: number) {
  if (code === 'JPY' || code === 'PKR') {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 4, minimumFractionDigits: 3 });
}

export function HeaderMarketStrip({
  className,
  variant = 'bar',
}: {
  className?: string;
  variant?: 'bar' | 'inline';
}) {
  const [now, setNow] = useState(() => formatDubaiTime(new Date()));
  const [rates, setRates] = useState<Partial<Record<QuoteCode, number>> | null>(null);

  useEffect(() => {
    const tick = () => setNow(formatDubaiTime(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/fx', { cache: 'force-cache' });
        if (!response.ok) return;
        const payload = (await response.json()) as FxPayload;
        if (!active || !payload.rates) return;
        setRates(payload.rates);
      } catch {
        // Keep strip usable with clock alone if FX is unavailable.
      }
    };
    void load();
    const refreshId = window.setInterval(load, 60 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(refreshId);
    };
  }, []);

  return (
    <div
      className={cn(
        'min-w-0 max-w-full',
        variant === 'bar' && 'border-b border-border/70 bg-secondary/35',
        className
      )}
      aria-label="Dubai time and currency rates"
    >
      <div
        className={cn(
          'flex max-w-full items-center gap-3 overflow-x-auto overscroll-x-contain touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          variant === 'bar' ? 'container-page h-9' : 'h-full min-w-0 flex-1 justify-center px-3'
        )}
      >
        <p className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold tabular-nums text-foreground">
          <Clock3 className="h-3.5 w-3.5 text-accent" aria-hidden />
          <span className="text-muted-foreground">Dubai</span>
          <time dateTime={now} className="font-bold tracking-tight">
            {now}
          </time>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">GST</span>
        </p>

        <span className="h-3 w-px shrink-0 bg-border" aria-hidden />

        <div className="flex min-w-0 items-center gap-2.5 text-[11px] font-semibold tabular-nums">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            1 AED
          </span>
          {QUOTE_CODES.map((code) => {
            const value = rates?.[code];
            return (
              <span
                key={code}
                className="inline-flex shrink-0 items-baseline gap-1 rounded-full border border-border/80 bg-background/80 px-2 py-0.5"
              >
                <span className="text-[10px] font-bold text-muted-foreground">{code}</span>
                <span className="text-foreground">{value != null ? formatRate(code, value) : '—'}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
