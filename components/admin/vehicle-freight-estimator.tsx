'use client';

import { useEffect, useState } from 'react';
import { Calculator, Loader2, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { CONTAINER_SHARE_COUNTS, exportQuotePrices, freightPerVehicle, normalizeVehicleModel, vehicleSizeForVolume, vehicleVolume, type ContainerSizeChoice } from '@/lib/vehicle-freight';

type ModelVolumeOption = { id: string; make: string; model: string; volume_m3: number; length_m: number | null; width_m: number | null; height_m: number | null };

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

type Props = {
  vehicleTitle: string;
  make?: string;
  model?: string;
  savedVolumeM3?: number | null;
  priceFob?: number | null;
  currency?: string;
  onQuoteApply?: (prices: { cf: number; cif?: number }) => void;
};

export function VehicleFreightEstimator({ vehicleTitle, make, model, savedVolumeM3, priceFob, currency, onQuoteApply }: Props) {
  const [country, setCountry] = useState('');
  const [port, setPort] = useState('');
  const [containerSize, setContainerSize] = useState<ContainerSizeChoice>('auto');
  const [enteredVolume, setEnteredVolume] = useState(savedVolumeM3 ? String(savedVolumeM3) : '');
  const [insurance, setInsurance] = useState('');
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
    void supabase.from('vehicle_model_specs').select('id,make,model,volume_m3,length_m,width_m,height_m').order('make').order('model')
      .then(({ data }) => {
        if (!active) return;
        const rows = (data || []) as ModelVolumeOption[];
        setModelVolumes(rows);
        setEnteredVolume(savedVolumeM3 ? String(savedVolumeM3) : '');
        setSelectedModelId('');
        setOptions([]);
        const match = rows.find((row) => make && model && normalizeVehicleModel(row.make) === normalizeVehicleModel(make) && normalizeVehicleModel(row.model) === normalizeVehicleModel(model));
        if (match && !savedVolumeM3) {
          setSelectedModelId(match.id);
          setModelSearch(`${match.make} ${match.model} · ${Number(match.volume_m3).toFixed(3)} m³`);
          setLength(match.length_m == null ? '' : String(match.length_m));
          setWidth(match.width_m == null ? '' : String(match.width_m));
          setHeight(match.height_m == null ? '' : String(match.height_m));
        }
      });
    void supabase.from('freight_charges').select('destination_country,destination_port').eq('is_active', true).limit(2000)
      .then(({ data }) => { if (active) setDestinations((data || []) as Array<{ destination_country: string; destination_port: string | null }>); });
    return () => { active = false; };
  }, [make, model, savedVolumeM3]);

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
    const savedVolume = Number(modelVolumes.find((item) => item.id === selectedModelId)?.volume_m3);
    const explicitVolume = Number(enteredVolume);
    const volume = selectedModelId ? savedVolume : explicitVolume > 0 ? explicitVolume : vehicleVolume(length, width, height);
    if (!volume || !Number.isFinite(volume) || volume <= 0) {
      setError('Choose a saved make/model, enter m³, or enter positive length, width, and height in metres.');
      return;
    }
    setBusy(true);
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
    const rows = ((data || []) as FreightOption[]).filter((row) => Number.isFinite(Number(row.freight_charge)) && Number(row.freight_charge) >= 0);
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
        Enter vehicle dimensions in metres. RoRo = L × W × H × rate per m³. A 40-ft container total is split across 6 small, 4 large, or 3 XL vehicles.
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
              setEnteredVolume('');
              const spec = modelVolumes.find((item) => item.id === match?.id);
              setLength(spec?.length_m == null ? '' : String(spec.length_m));
              setWidth(spec?.width_m == null ? '' : String(spec.width_m));
              setHeight(spec?.height_m == null ? '' : String(spec.height_m));
              setOptions([]);
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
              setOptions([]);
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
            onChange={(e) => { setPort(e.target.value); setOptions([]); }}
            placeholder={country ? 'Type to search ports' : 'Choose a country first'}
            autoComplete="off"
            required
          />
          <datalist id="est-port-options">
            {portOptions.map((option) => <option key={option} value={option} />)}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="est-container-size">40-ft sharing size</Label>
          <select id="est-container-size" value={containerSize} onChange={(e) => setContainerSize(e.target.value as ContainerSizeChoice)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="auto">Auto by M³</option>
            <option value="small">Small · 6 vehicles per container</option>
            <option value="large">Large · 4 vehicles per container</option>
            <option value="xl">XL · 3 vehicles per container</option>
          </select>
          <p className="text-xs text-muted-foreground">Auto: up to 9 m³ = small; over 9 to 14 m³ = large; over 14 m³ = XL. Override if your carrier assigns another class.</p>
        </div>
        {!selectedModelId && <div className="space-y-1.5">
          <Label htmlFor="est-volume">Vehicle volume (m³)</Label>
          <Input id="est-volume" type="number" min="0.001" step="0.001" value={enteredVolume} onChange={(event) => { setEnteredVolume(event.target.value); setOptions([]); }} placeholder="Saved vehicle m³, or use dimensions" />
        </div>}
        {priceFob != null && currency && <div className="space-y-1.5">
          <Label htmlFor="est-insurance">Insurance amount ({currency})</Label>
          <Input id="est-insurance" type="number" min="0" step="0.01" value={insurance} onChange={(event) => setInsurance(event.target.value)} placeholder="Enter insurance to calculate CIF" />
        </div>}
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
              onChange={(e) => { (setter as (value: string) => void)(e.target.value); setOptions([]); }}
              required={!enteredVolume}
              disabled={Boolean(enteredVolume)}
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
            const resolvedSize = containerSize === 'auto' ? vehicleSizeForVolume(volumeM3 || 0) : containerSize;
            const shareCount = CONTAINER_SHARE_COUNTS[resolvedSize];
            const perVehicle = freightPerVehicle(option.shipment_type, volumeM3!, rate, containerSize);
            const sameCurrency = currency?.trim().toUpperCase() === option.currency.trim().toUpperCase();
            const insuranceAmount = Number(insurance);
            const hasInsurance = insurance.trim() !== '' && Number.isFinite(insuranceAmount) && insuranceAmount >= 0;
            const quote = priceFob != null && Number.isFinite(Number(priceFob)) && Number(priceFob) >= 0 && sameCurrency
              ? exportQuotePrices(Number(priceFob), perVehicle, hasInsurance ? insuranceAmount : 0) : null;
            return (
              <div key={option.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{isRoro ? 'RoRo' : `40-ft container · ${resolvedSize.toUpperCase()} share`} · {option.shipping_company || 'configured rate'}</p>
                  <p className="text-xs text-muted-foreground">
                    {option.source_country}{option.source_port ? ` / ${option.source_port}` : ''}
                    {' → '}{country} / {port} · {isRoro ? `${amount(rate, option.currency)} per m³` : `${amount(rate, option.currency)} container total ÷ ${shareCount} vehicles`}
                  </p>
                </div>
                <div className="text-right"><p className="text-lg font-bold tabular-nums">{amount(perVehicle, option.currency)}{isRoro ? '' : ' / vehicle'}</p>{!isRoro ? <p className="text-xs text-muted-foreground">Container total: {amount(rate, option.currency)}</p> : null}</div>
                </div>
                {quote ? <div className="mt-3 border-t pt-3">
                  <p className="text-sm font-semibold">FOB {amount(quote.fob, option.currency)} → C&amp;F {amount(quote.cf, option.currency)}{hasInsurance ? ` → CIF ${amount(quote.cif, option.currency)}` : ''}</p>
                  <p className="mt-1 text-xs text-muted-foreground">C&amp;F includes freight per vehicle. CIF adds the insurance amount you enter; duties and local charges are separate.</p>
                  {onQuoteApply && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => onQuoteApply({ cf: quote.cf, ...(hasInsurance ? { cif: quote.cif } : {}) })}>Use these quote prices in the vehicle form</Button>}
                </div> : currency && priceFob != null && !sameCurrency ? <p className="mt-3 text-xs text-muted-foreground">Freight is in {option.currency}; convert to {currency} before adding it to FOB.</p> : null}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Estimate only; handling, insurance, duties, taxes, and surcharges may be extra.</p>
        </div>
      ) : null}
    </section>
  );
}
