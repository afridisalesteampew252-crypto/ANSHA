'use client';

import { useEffect, useState } from 'react';
import { Calculator, Loader2, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';

type ModelVolumeOption = { id: string; make: string; model: string; volume_m3: number };

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
  const [modelVolumes, setModelVolumes] = useState<ModelVolumeOption[]>([]);
  const [destinations, setDestinations] = useState<Array<{ destination_country: string; destination_port: string | null }>>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [options, setOptions] = useState<FreightOption[]>([]);
  const [volumeM3, setVolumeM3] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.from('vehicle_model_specs').select('id,make,model,volume_m3').order('make').order('model')
      .then(({ data }) => { if (active) setModelVolumes((data || []) as ModelVolumeOption[]); });
    void supabase.from('freight_charges').select('destination_country,destination_port').eq('is_active', true).limit(2000)
      .then(({ data }) => { if (active) setDestinations((data || []) as Array<{ destination_country: string; destination_port: string | null }>); });
    return () => { active = false; };
  }, []);

  const modelOptions = modelVolumes.map((item) => ({
    id: item.id,
    label: item.make + ' ' + item.model + ' · ' + Number(item.volume_m3).toFixed(3) + ' m³',
  }));
  const countryOptions = Array.from(new Set(destinations.map((item) => item.destination_country).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  const portOptions = Array.from(new Set(destinations
    .filter((item) => item.destination_country.toLowerCase() === country.trim().toLowerCase())
    .map((item) => item.destination_port).filter((item): item is string => Boolean(item))))
    .sort((a, b) => a.localeCompare(b));

  async function calculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setOptions([]);
    const l = Number(length);
    const w = Number(width);
    const h = Number(height);
    const savedVolume = Number(modelVolumes.find((item) => item.id === selectedModelId)?.volume_m3);
    if (!selectedModelId && ![l, w, h].every((n) => Number.isFinite(n) && n > 0)) {
      setError('Choose a saved make/model or enter positive length, width, and height in metres.');
      return;
    }
    setBusy(true);
    const volume = selectedModelId ? savedVolume : l * w * h;
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
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="est-model">Saved vehicle make/model (optional)</Label>
          <Input
            id="est-model"
            list="est-model-options"
            value={modelSearch}
            placeholder="Type to search make or model, or enter dimensions below"
            autoComplete="off"
            onChange={(e) => {
              const value = e.target.value;
              setModelSearch(value);
              const match = modelOptions.find((option) => option.label.toLowerCase() === value.trim().toLowerCase());
              setSelectedModelId(match?.id || '');
            }}
          />
          <datalist id="est-model-options">
            {modelOptions.map((option) => <option key={option.id} value={option.label} />)}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="est-country">Destination country</Label>
          <Input
            id="est-country"
            list="est-country-options"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setPort('');
            }}
            placeholder="Type to search countries"
            autoComplete="off"
            required
          />
          <datalist id="est-country-options">
            {countryOptions.map((option) => <option key={option} value={option} />)}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="est-port">Destination port</Label>
          <Input
            id="est-port"
            list="est-port-options"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder={country ? 'Type to search ports' : 'Choose a country first'}
            autoComplete="off"
            required
          />
          <datalist id="est-port-options">
            {portOptions.map((option) => <option key={option} value={option} />)}
          </datalist>
        </div>
        {!selectedModelId && [
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
      <p className="mt-2 text-xs text-muted-foreground">Start typing in each field to search configured options. Ports update after you choose or type a destination country.</p>
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
