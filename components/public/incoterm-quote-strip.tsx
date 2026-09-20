import { PRICE_TERM_LABELS } from '@/lib/trade-terms';

type Props = {
  currency: string;
  showPrice: boolean;
  priceFob?: number | null;
  priceCf?: number | null;
  priceCif?: number | null;
};

function formatAmount(currency: string, value: number) {
  return `${currency} ${value.toLocaleString()}`;
}

/** Public Incoterm quote strip when show_price is on and any FOB/C&F/CIF is set. */
export function IncotermQuoteStrip({ currency, showPrice, priceFob, priceCf, priceCif }: Props) {
  if (!showPrice) return null;
  const rows = [
    { term: 'fob' as const, value: priceFob },
    { term: 'cf' as const, value: priceCf },
    { term: 'cif' as const, value: priceCif },
  ].filter((row) => row.value != null && row.value > 0);

  if (rows.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {rows.map((row) => (
        <div key={row.term} className="rounded-xl border border-accent/15 bg-card px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {PRICE_TERM_LABELS[row.term]}
          </p>
          <p className="text-sm font-extrabold tracking-tight">{formatAmount(currency, row.value!)}</p>
        </div>
      ))}
    </div>
  );
}
