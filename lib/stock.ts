export const STOCK_ORIGINS = [
  { value: 'japan', label: 'Japan Stock' },
  { value: 'dubai', label: 'Dubai Stock' },
  { value: 'singapore', label: 'Singapore Stock' },
  { value: 'china', label: 'China Stock' },
  { value: 'thailand', label: 'Thailand Stock' },
  { value: 'taiwan', label: 'Taiwan Stock' },
] as const;

export type StockOrigin = (typeof STOCK_ORIGINS)[number]['value'];
export type StockStatus = 'available' | 'reserved' | 'sold';

export function stockOriginLabel(value: string | null | undefined) {
  return STOCK_ORIGINS.find((origin) => origin.value === value)?.label || 'Dubai Stock';
}
