'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PRICE_TERM_LABELS, type PriceTerm } from '@/lib/trade-terms';

type Values = {
  priceFob: string;
  priceCf: string;
  priceCif: string;
};

type Props = {
  values: Values;
  onChange: (patch: Partial<Values>) => void;
  currency?: string;
  disabled?: boolean;
  /** When true, also show the legacy list price field managed by parent. */
  hint?: string;
};

const fields: Array<{ key: keyof Values; term: PriceTerm }> = [
  { key: 'priceFob', term: 'fob' },
  { key: 'priceCf', term: 'cf' },
  { key: 'priceCif', term: 'cif' },
];

export function IncotermPriceFields({ values, onChange, currency, disabled, hint }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Sell quotes (Incoterms)</p>
        <p className="text-xs text-muted-foreground">
          {hint ||
            `Optional FOB, C&F, and CIF amounts${currency ? ` in ${currency}` : ''}. Used on reservations and public catalog when shown.`}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {fields.map(({ key, term }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`incoterm-${key}`}>{PRICE_TERM_LABELS[term]}</Label>
            <Input
              id={`incoterm-${key}`}
              type="number"
              min="0"
              step="0.01"
              disabled={disabled}
              value={values[key]}
              onChange={(e) => onChange({ [key]: e.target.value })}
              placeholder="0.00"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function parseOptionalPrice(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
