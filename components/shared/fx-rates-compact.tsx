'use client';

import { cn } from '@/lib/utils';
import { formatFxRate } from '@/lib/fx';
import { useFxRates } from '@/hooks/use-fx-rates';

export function FxRatesCompact({
  className,
  dense = false,
}: {
  className?: string;
  dense?: boolean;
}) {
  const { rates, quotes } = useFxRates();

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain tabular-nums [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-2',
        className
      )}
      aria-label="AED exchange rates"
    >
      <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-accent sm:px-2 sm:text-[10px]">
        1 AED
      </span>
      {quotes.map((code) => {
        const value = rates?.[code];
        return (
          <span
            key={code}
            className={cn(
              'inline-flex shrink-0 items-baseline gap-1 rounded-md border border-border/80 bg-card px-1.5 py-0.5',
              dense ? 'text-[10px]' : 'text-[10px] sm:text-xs'
            )}
          >
            <span className="font-bold text-accent">{code}</span>
            <span className="font-semibold text-foreground">
              {value != null ? formatFxRate(code, value) : '—'}
            </span>
          </span>
        );
      })}
    </div>
  );
}
