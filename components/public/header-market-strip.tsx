'use client';

import { Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FX_QUOTE_CODES, formatFxRate, type FxQuoteCode } from '@/lib/fx';
import { useFxRates } from '@/hooks/use-fx-rates';
import { useLiveClock } from '@/hooks/use-live-clock';

export function HeaderMarketStrip({
  className,
}: {
  className?: string;
}) {
  const now = useLiveClock('Asia/Dubai');
  const { rates } = useFxRates();

  return (
    <div
      className={cn(
        'header-market-strip min-w-0 max-w-full overflow-x-clip border-t border-[#cdbfc1]/35',
        className
      )}
      aria-label="Dubai time and currency rates"
    >
      <div className="container-page flex h-8 min-w-0 max-w-full items-center gap-3 overflow-x-auto overscroll-x-contain touch-pan-x md:h-9 md:gap-4 lg:justify-between [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <p className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[#171415] md:gap-2 md:text-xs">
          <Clock3 className="h-3.5 w-3.5 text-[#d21e1e]" aria-hidden />
          <span className="hidden text-[#5c6366] sm:inline">Dubai</span>
          <time dateTime={now} className="font-bold tracking-tight text-[#171415]">
            {now}
          </time>
          <span className="rounded bg-white/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#5c6366]">
            GST
          </span>
        </p>

        <span className="hidden h-4 w-px shrink-0 bg-[#cdbfc1]/80 sm:block lg:hidden" aria-hidden />

        <div className="flex min-w-0 shrink-0 items-center gap-2 text-[11px] font-semibold tabular-nums text-[#171415] md:gap-2.5 md:text-xs">
          <span className="shrink-0 rounded-full border border-[#d21e1e]/35 bg-white/55 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#d21e1e] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md">
            1 AED
          </span>
          <span className="hidden shrink-0 text-[#828789] md:inline" aria-hidden>
            →
          </span>
          {FX_QUOTE_CODES.map((code: FxQuoteCode) => {
            const value = rates?.[code];
            return (
              <span key={code} className="header-market-chip md:gap-1.5 md:px-2.5 md:py-1">
                <span className="text-[10px] font-bold text-[#d21e1e] md:text-xs">{code}</span>
                <span className="text-[#171415] md:text-[13px] md:font-bold">
                  {value != null ? formatFxRate(code, value) : '—'}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
