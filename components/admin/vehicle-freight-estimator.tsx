'use client';

import { useState } from 'react';
import { Calculator, Loader2, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';

type FreightOption = {
  id: string;
  source_country: string;
  source_port: string | null;
  shipment_type: 'roro' | 'container_40ft';
  freight_charge: number;
  currency: string;
  shipping_company: string | null;
};

function amount(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function VehicleFreightEstimator({ vehicleTitle }: { vehicleTitle: string }) {
  const [country, setCountry] = useState('');
  const [port, setPort] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [options, setOptions] = useState<FreightOption[]>([]);
  const [volumeM3, setVolumeM3] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function calculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setOptions([]);
    const l = Number(length);
    const w = Number(width);
    const h = Number(height);
    if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) {
      setError('Enter a positive length, width, and height in metres.');
      return;
    }
    setBusy(true);
    const volume = l * w * h;
    const { data, error: queryError } = await supabase
      .from('freight_charges')
      .select('id, source_country, source_port, shipment_type, freight_charge, currency, shipping_company')
      .eq('is_active', true)
      .ilike('destination_country', country.trim())
      .ilike('destination_port', port.trim())
      .in('shipment_type', ['roro', 'container_40ft'])
      .order('sort_order')
      .order('freight_charge');
    setBusy(false);
    if (queryError) {
      setError('Rates could not be loaded. Check your admin access and freight configuration.');
      return;
    }
    const rows = (data || []) as FreightOption[];
    if (!rows.length) {
      setError('No active RoRo or 40-ft rate matches this country and port.');
      return;
    }
    setVolumeM3(volume);
    setOptions(rows);
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-accent" />
        <h2 className="font-semibold">Freight estimate · {vehicleTitle}</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Enter vehicle dimensions in metres. RoRo = L × W × H × rate per m³. A 40-ft option is the full price for one container.
      </p>
      <form onSubmit={calculate} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="est-country">Destination country</Label>
          <Input id="est-country" value={country} onChange={(e) => setCountry(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="est-port">Destination port</Label>
          <Input id="est-port" value={port} onChange={(e) => setPort(e.target.value)} required />
        </div>
        {[
          ['est-length', 'Length (m)', length, setLength],
          ['est-width', 'Width (m)', width, setWidth],
          ['est-height', 'Height (m)', height, setHeight],
        ].map(([id, label, value, setter]) => (
          <div key={id as string} className="space-y-1.5">
            <Label htmlFor={id as string}>{label as string}</Label>
            <Input
              id={id as string}
              type="number"
              min="0.01"
              step="0.01"
              value={value as string}
              onChange={(e) => (setter as (value: string) => void)(e.target.value)}
              required
            />
          </div>
        ))}
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ship className="h-4 w-4" />}
            {busy ? 'Calculating…' : 'Calculate'}
          </Button>
        </div>
      </form>
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
      {options.length ? (
        <div className="mt-4 space-y-2" aria-live="polite">
          <p className="text-sm font-semibold">Vehicle volume: {volumeM3?.toFixed(3)} m³</p>
          {options.map((option) => {
            const isRoro = option.shipment_type === 'roro';
            const rate = Number(option.freight_charge);
            const total = isRoro ? (volumeM3 || 0) * rate : rate;
            return (
              <div key={option.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="font-medium">{isRoro ? 'RoRo' : '40-ft container'} · {option.shipping_company || 'configured rate'}</p>
                  <p className="text-xs text-muted-foreground">
                    {option.source_country}{option.source_port ? ` / ${option.source_port}` : ''}
                    {' → '}{country} / {port} · {isRoro ? `${amount(rate, option.currency)} per m³` : 'full container total'}
                  </p>
                </div>
                <p className="text-lg font-bold tabular-nums">{amount(total, option.currency)}</p>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Estimate only; handling, insurance, duties, taxes, and surcharges may be extra.</p>
        </div>
      ) : null}
    </section>
  );
}
