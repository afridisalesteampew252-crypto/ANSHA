export const STOCK_ORIGINS = [
  { value: 'japan', label: 'Japan Stock' },
  { value: 'dubai', label: 'Dubai Stock' },
  { value: 'singapore', label: 'Singapore Stock' },
  { value: 'china', label: 'China Stock' },
  { value: 'thailand', label: 'Thailand Stock' },
  { value: 'taiwan', label: 'Taiwan Stock' },
] as const;

export const STOCK_POOLS = [
  { value: 'owned', label: 'Owned inventory' },
  { value: 'auction_third_party', label: 'Auction stock' },
] as const;

export type StockOrigin = (typeof STOCK_ORIGINS)[number]['value'];
export type StockPool = (typeof STOCK_POOLS)[number]['value'];
export type StockStatus = 'available' | 'reserved' | 'sold';

export function stockOriginLabel(value: string | null | undefined) {
  return STOCK_ORIGINS.find((origin) => origin.value === value)?.label || 'Dubai Stock';
}

export function stockPoolLabel(value: string | null | undefined) {
  return STOCK_POOLS.find((pool) => pool.value === value)?.label || 'Owned inventory';
}

export function isAuctionStockPool(value: string | null | undefined) {
  return value === 'auction_third_party';
}

/** Japan-origin uploads default to auction/third-party until purchased into inventory. */
export function defaultStockPoolForOrigin(origin: string | null | undefined): StockPool {
  return origin === 'japan' ? 'auction_third_party' : 'owned';
}
