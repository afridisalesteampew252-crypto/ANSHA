/**
 * Non-blocking price sanity checks for admin price entry (vehicle forms + bulk price tool).
 * Nothing here prevents a save; it only surfaces likely typos (an extra/missing zero,
 * a price entered in the wrong currency, a percentage applied twice...).
 */
export const PRICE_SANITY_MIN_USD = 1_000;
export const PRICE_SANITY_MAX_USD = 200_000;
/** Warn when a price is below half or above double the peer median. */
const LOW_RATIO = 0.5;
const HIGH_RATIO = 2;
const MIN_PEERS = 3;

export type PeerStats = { median: number; count: number };

export function peerKey(make: string | null | undefined, model: string | null | undefined, year: number | string | null | undefined, currency: string | null | undefined) {
  return [
    (make || '').trim().toLowerCase(),
    (model || '').trim().toLowerCase(),
    String(year ?? '').trim(),
    (currency || 'USD').trim().toUpperCase(),
  ].join('|');
}

export function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Builds make|model|year|currency → median for a list of rows (ignores blank/zero prices). */
export function buildPeerStats<T>(rows: T[], pick: (row: T) => { make: string | null; model: string | null; year: number | string | null; currency: string | null; price: number | null }) {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const item = pick(row);
    const price = Number(item.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const key = peerKey(item.make, item.model, item.year, item.currency);
    const list = groups.get(key);
    if (list) list.push(price);
    else groups.set(key, [price]);
  }
  const stats = new Map<string, PeerStats>();
  groups.forEach((values, key) => {
    const value = median(values);
    if (value != null) stats.set(key, { median: value, count: values.length });
  });
  return stats;
}

const formatAmount = (value: number) => Math.round(value).toLocaleString('en-US');

export function priceSanityWarning({
  price,
  currency,
  peers,
  peerLabel,
}: {
  price: number | null | undefined;
  currency: string | null | undefined;
  peers?: PeerStats | null;
  peerLabel?: string;
}): string | null {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const code = (currency || 'USD').trim().toUpperCase();
  if (code === 'USD' && amount < PRICE_SANITY_MIN_USD) {
    return `${formatAmount(amount)} USD is under ${formatAmount(PRICE_SANITY_MIN_USD)} USD. Check for a missing digit.`;
  }
  if (code === 'USD' && amount > PRICE_SANITY_MAX_USD) {
    return `${formatAmount(amount)} USD is over ${formatAmount(PRICE_SANITY_MAX_USD)} USD. Check for an extra digit.`;
  }
  if (peers && peers.count >= MIN_PEERS && peers.median > 0) {
    const ratio = amount / peers.median;
    if (ratio < LOW_RATIO || ratio > HIGH_RATIO) {
      const pct = Math.round(Math.abs(ratio - 1) * 100);
      const direction = ratio < 1 ? 'below' : 'above';
      return `${formatAmount(amount)} ${code} is ${pct}% ${direction} the median of ${formatAmount(peers.median)} ${code} for ${peers.count} ${peerLabel || 'similar vehicles'}.`;
    }
  }
  return null;
}
