'use client';

import { cn } from '@/lib/utils';
import {
  currencyEntries,
  formatMoney,
  formatMoneyCompact,
  normalizeCurrency,
  pickCurrencyAmount,
} from '@/lib/money';

type MoneyBreakdownProps = {
  amounts: Record<string, number>;
  /** When set (and not `all`), show only that currency. */
  currencyFilter?: string;
  compact?: boolean;
  className?: string;
  emptyCurrency?: string;
  /** Larger KPI style (dashboard cards). */
  size?: 'sm' | 'md' | 'lg';
};

/**
 * Stacked per-currency amounts — never converts or sums across currencies.
 */
export function MoneyBreakdown({
  amounts,
  currencyFilter = 'all',
  compact = false,
  className,
  emptyCurrency = 'AED',
  size = 'md',
}: MoneyBreakdownProps) {
  const entries =
    currencyFilter !== 'all'
      ? ([[normalizeCurrency(currencyFilter), pickCurrencyAmount(amounts, currencyFilter)] as [string, number]])
      : currencyEntries(amounts);

  const fmt = compact ? formatMoneyCompact : formatMoney;
  const emptyCur = normalizeCurrency(emptyCurrency);

  if (!entries.length) {
    return (
      <span className={cn(lineClass(size, false), className)}>
        {fmt(0, emptyCur)}
      </span>
    );
  }

  if (entries.length === 1) {
    const [currency, value] = entries[0];
    return (
      <span className={cn(lineClass(size, false), className)}>
        {fmt(value, currency)}
      </span>
    );
  }

  return (
    <span className={cn('flex flex-col gap-0.5', className)}>
      {entries.map(([currency, value]) => (
        <span key={currency} className={lineClass(size, true)}>
          {fmt(value, currency)}
        </span>
      ))}
    </span>
  );
}

function lineClass(size: 'sm' | 'md' | 'lg', stacked: boolean): string {
  if (size === 'lg') {
    return stacked
      ? 'text-base font-bold leading-snug tracking-tight sm:text-lg'
      : 'text-2xl font-black leading-snug tracking-tight';
  }
  if (size === 'sm') {
    return stacked ? 'text-sm font-semibold leading-snug' : 'text-base font-bold leading-snug';
  }
  return stacked
    ? 'text-base font-bold leading-snug sm:text-lg'
    : 'text-2xl font-bold leading-snug';
}
