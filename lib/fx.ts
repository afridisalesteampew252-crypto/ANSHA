export const FX_QUOTE_CODES = ['USD', 'EUR', 'JPY', 'PKR'] as const;
export type FxQuoteCode = (typeof FX_QUOTE_CODES)[number];

export type FxPayload = {
  base: string;
  rates: Partial<Record<FxQuoteCode, number>> | null;
  updatedAt?: string;
  error?: string;
};

export function formatFxRate(code: FxQuoteCode, value: number) {
  if (code === 'JPY' || code === 'PKR') {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 4, minimumFractionDigits: 3 });
}
