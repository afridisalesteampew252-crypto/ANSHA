/** Shared money formatting — never invent FX conversion across currencies. */

const CURRENCY_PRIORITY = ['AED', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'CHF', 'CAD', 'AUD'];

export function normalizeCurrency(code?: string | null): string {
  const cur = String(code || 'AED').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(cur) ? cur : 'AED';
}

export function formatMoney(
  value: number,
  currency: string = 'AED',
  options?: Intl.NumberFormatOptions
): string {
  const cur = normalizeCurrency(currency);
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 2,
      ...options,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${cur}`;
  }
}

/** Compact KPI style (e.g. dashboard cards). */
export function formatMoneyCompact(value: number, currency: string = 'AED'): string {
  const amount = Number(value || 0);
  return formatMoney(amount, currency, {
    notation: Math.abs(amount) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  });
}

export function addToCurrencyMap(
  map: Record<string, number>,
  currency: string | null | undefined,
  amount: number
): void {
  const cur = normalizeCurrency(currency);
  map[cur] = (map[cur] || 0) + Number(amount || 0);
}

export function sortCurrencyEntries(entries: Array<[string, number]>): Array<[string, number]> {
  return [...entries].sort((a, b) => {
    const ai = CURRENCY_PRIORITY.indexOf(a[0]);
    const bi = CURRENCY_PRIORITY.indexOf(b[0]);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a[0].localeCompare(b[0]);
  });
}

export function currencyEntries(
  amounts: Record<string, number>,
  options?: { includeZeros?: boolean }
): Array<[string, number]> {
  const entries = Object.entries(amounts).map(([currency, value]) => [
    normalizeCurrency(currency),
    Number(value || 0),
  ] as [string, number]);
  const filtered = options?.includeZeros
    ? entries
    : entries.filter(([, value]) => Math.abs(value) > 1e-9);
  return sortCurrencyEntries(filtered);
}

/** Unique currencies present in a list, priority-sorted. */
export function listCurrencies(codes: Array<string | null | undefined>): string[] {
  const set = new Set(codes.map((c) => normalizeCurrency(c)));
  return sortCurrencyEntries(Array.from(set).map((c) => [c, 1] as [string, number])).map(([c]) => c);
}

/**
 * Human-readable multi-currency total. Does not convert — lists each currency separately.
 * `separator: 'block'` → newline (use with CSS whitespace-pre-line).
 * `separator: 'inline'` → middle-dot join for compact chips.
 */
export function formatMoneyBreakdown(
  amounts: Record<string, number>,
  options?: {
    compact?: boolean;
    separator?: 'block' | 'inline';
    emptyCurrency?: string;
    includeZeros?: boolean;
  }
): string {
  const entries = currencyEntries(amounts, { includeZeros: options?.includeZeros });
  const emptyCur = normalizeCurrency(options?.emptyCurrency);
  if (!entries.length) {
    return options?.compact ? formatMoneyCompact(0, emptyCur) : formatMoney(0, emptyCur);
  }
  const fmt = options?.compact ? formatMoneyCompact : formatMoney;
  const joiner = options?.separator === 'inline' ? ' · ' : '\n';
  return entries.map(([currency, value]) => fmt(value, currency)).join(joiner);
}

export function pickCurrencyAmount(
  amounts: Record<string, number>,
  currency: string | null | undefined
): number {
  return Number(amounts[normalizeCurrency(currency)] || 0);
}

/** Currencies with a non-zero amount in any of the maps (priority-sorted). */
export function activeCurrencies(...maps: Array<Record<string, number>>): string[] {
  const codes: string[] = [];
  for (const map of maps) {
    for (const [currency] of currencyEntries(map)) codes.push(currency);
  }
  return listCurrencies(codes);
}
