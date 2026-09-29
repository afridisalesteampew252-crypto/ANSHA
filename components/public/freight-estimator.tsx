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

export function FreightEstimator({
  destinationCountry,
  suggestedPort,
}: {
  destinationCountry: string;
  suggestedPort?: string;
}) {
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
    if (!port.trim()) {
      setError('Enter the destination port exactly as it appears in the freight configuration.');
      return;
    }
    if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) {
      setError('Enter a positive length, width, and height in metres.');
      return;
    }
    setBusy(true);
    const volume = l * w * h;
    const { data, error: queryError } = await supabase.rpc('get_public_freight_options', {
      p_destination_country: destinationCountry,
      p_destination_port: port.trim(),
    });
    setBusy(false);
    if (queryError) {
      setError('Freight rates could not be loaded. Please contact ANSHA for a quote.');
      return;
    }
    const rows = (data || []) as FreightOption[];
    if (!rows.length) {
      setError('No active RoRo or 40-ft rate is configured for this country and port yet.');
      return;
    }
    setVolumeM3(volume);
    setOptions(rows);
  }

  return (
    <div className="catalog-panel p-5 sm:p-6">
      <div className="flex items-center gap-2 text-accent">
        <Calculator className="h-4 w-4" />
        <h2 className="text-sm font-bold uppercase tracking-wide">Freight estimate</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Add the dimensions of one vehicle. RoRo uses volume (L × W × H) × the configured price per m³.
        A 40-ft option shows the total price for one complete container.
      </p>
      <form onSubmit={calculate} className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="freight-port">Destination port</Label>
          <Input
            id="freight-port"
            list="freight-port-suggestions"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder={suggestedPort || 'e.g. Mombasa'}
            required
          />
          {suggestedPort ? (
            <datalist id="freight-port-suggestions">
              {suggestedPort.split(/[,;/]/).map((item) => item.trim()).filter(Boolean).map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          ) : null}
          <p className="text-xs text-muted-foreground">Use the same port name entered in Configuration → Freight Charges.</p>
        </div>
        {[
          ['length', 'Length (m)', length, setLength],
          ['width', 'Width (m)', width, setWidth],
          ['height', 'Height (m)', height, setHeight],
        ].map(([id, label, value, setter]) => (
          <div key={id as string} className="space-y-1.5">
            <Label htmlFor={id as string}>{label as string}</Label>
            <Input
              id={id as string}
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={value as string}
              onChange={(e) => (setter as (value: string) => void)(e.target.value)}
              placeholder="e.g. 4.50"
              required
            />
          </div>
        ))}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy} className="w-full sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ship className="h-4 w-4" />}
            {busy ? 'Calculating…' : 'Calculate shipping'}
          </Button>
        </div>
      </form>
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
      {options.length ? (
        <div className="mt-4 space-y-2" aria-live="polite">
          <p className="text-sm font-semibold">Estimated volume: {volumeM3?.toFixed(3)} m³</p>
          {options.map((option) => {
            const isRoro = option.shipment_type === 'roro';
            const total = isRoro ? (volumeM3 || 0) * Number(option.freight_charge) : Number(option.freight_charge);
            return (
              <div key={option.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/10 bg-background/70 p-3">
                <div>
                  <p className="text-sm font-semibold">{isRoro ? 'RoRo · volume rate' : '40-ft container · full container total'}</p>
                  <p className="text-xs text-muted-foreground">
                    {option.shipping_company || 'Configured route rate'} · {option.source_country}{option.source_port ? ` / ${option.source_port}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isRoro
                      ? `${amount(Number(option.freight_charge), option.currency)} per m³`
                      : 'Flat freight price for one complete 40-ft container'}
                  </p>
                </div>
                <p className="text-lg font-bold tabular-nums">{amount(total, option.currency)}</p>
              </div>
            );
          })}
          <p className="text-xs leading-5 text-muted-foreground">
            Estimate only. Port handling, documentation, insurance, duties, taxes, inland delivery, and carrier
            surcharges may be extra. Confirm the final quote with ANSHA before payment.
          </p>
        </div>
      ) : null}
    </div>
  );
}
