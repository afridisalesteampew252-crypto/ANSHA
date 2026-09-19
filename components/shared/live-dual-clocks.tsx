'use client';

import { Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADMIN_CLOCK_ZONES, useLiveClocks } from '@/hooks/use-live-clock';

export function LiveDualClocks({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const times = useLiveClocks(ADMIN_CLOCK_ZONES);

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 tabular-nums sm:gap-3',
        className
      )}
      aria-label="Pakistan and Dubai time"
    >
      {ADMIN_CLOCK_ZONES.map((zone, index) => (
        <div key={zone.id} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          {index === 0 ? (
            <Clock3 className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          ) : (
            <span className="hidden h-3.5 w-px shrink-0 bg-border sm:block" aria-hidden />
          )}
          <span className={cn('shrink-0 font-semibold text-muted-foreground', compact ? 'text-[10px]' : 'text-[10px] sm:text-xs')}>
            {compact ? (zone.id === 'pk' ? 'PK' : 'DXB') : zone.label}
          </span>
          <time dateTime={times[zone.id]} className={cn('font-bold tracking-tight text-foreground', compact ? 'text-xs' : 'text-xs sm:text-sm')}>
            {times[zone.id]}
          </time>
          {zone.badge ? (
            <span className="hidden rounded bg-secondary px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground sm:inline">
              {zone.badge}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
