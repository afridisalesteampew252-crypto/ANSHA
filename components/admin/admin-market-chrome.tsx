'use client';

import { LiveDualClocks } from '@/components/shared/live-dual-clocks';
import { FxRatesCompact } from '@/components/shared/fx-rates-compact';
import { cn } from '@/lib/utils';

/** Admin top-bar clocks + AED FX — shared data hooks with public `/api/fx`. */
export function AdminMarketChrome({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'admin-market-chrome flex min-w-0 flex-col gap-1.5 xl:flex-row xl:items-center xl:gap-4',
        className
      )}
    >
      <LiveDualClocks compact={compact} />
      <FxRatesCompact dense={compact} className="max-w-full" />
    </div>
  );
}
