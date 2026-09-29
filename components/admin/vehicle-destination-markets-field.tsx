'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EXPORT_MARKETS } from '@/lib/export-markets';

type Props = {
  value: string[];
  onChange: (codes: string[]) => void;
};

export function VehicleDestinationMarketsField({ value, onChange }: Props) {
  const [search, setSearch] = useState('');
  const filteredMarkets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return EXPORT_MARKETS.filter((market) =>
      !query || market.name.toLowerCase().includes(query) || market.code.toLowerCase().includes(query)
    );
  }, [search]);

  const toggleMarket = (code: string, checked: boolean) => {
    onChange(checked ? [...new Set([...value, code])] : value.filter((item) => item !== code));
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <div>
        <Label htmlFor="vehicle-destination-search">Destination pages</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Select countries where this vehicle should appear as a curated pick. This does not mean it is a popularity ranking.
        </p>
      </div>
      <Input
        id="vehicle-destination-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search countries"
        aria-label="Search destination countries"
      />
      <div className="max-h-48 overflow-y-auto rounded-md border p-3">
        {filteredMarkets.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMarkets.map((market) => (
              <label key={market.code} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value.includes(market.code)}
                  onChange={(event) => toggleMarket(market.code, event.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <span>{market.name}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No matching countries.</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{value.length} destination{value.length === 1 ? '' : 's'} selected</p>
    </div>
  );
}
