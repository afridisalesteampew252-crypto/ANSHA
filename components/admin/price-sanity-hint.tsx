'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { median, priceSanityWarning, type PeerStats } from '@/lib/price-sanity';

/**
 * Non-blocking warning under the vehicle price fields: flags FOB prices under 1,000 / over
 * 200,000 USD or far from the median FOB of other vehicles with the same make, model, year and
 * currency. Never blocks saving.
 */
export function PriceSanityHint({
  price,
  currency,
  make,
  model,
  year,
  excludeVehicleId,
}: {
  price: string;
  currency: string;
  make: string;
  model: string;
  year: string;
  excludeVehicleId?: string;
}) {
  const [peers, setPeers] = useState<PeerStats | null>(null);
  const cleanMake = make.trim();
  const cleanModel = model.trim();
  const numericYear = Number.parseInt(year, 10);
  const code = (currency || 'USD').trim().toUpperCase();

  useEffect(() => {
    if (!cleanMake || !cleanModel || !Number.isFinite(numericYear)) {
      setPeers(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      let request = supabase
        .from('vehicles')
        .select('price_fob')
        .ilike('make', cleanMake)
        .ilike('model', cleanModel)
        .eq('year', numericYear)
        .eq('currency', code)
        .gt('price_fob', 0)
        .limit(200);
      if (excludeVehicleId) request = request.neq('id', excludeVehicleId);
      const { data, error } = await request;
      if (!active) return;
      if (error) {
        setPeers(null);
        return;
      }
      const values = (data || []).map((row) => Number(row.price_fob));
      const value = median(values);
      setPeers(value != null ? { median: value, count: values.length } : null);
    }, 500);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cleanMake, cleanModel, numericYear, code, excludeVehicleId]);

  const warning = priceSanityWarning({
    price: price.trim() ? Number(price) : null,
    currency: code,
    peers,
    peerLabel: `other ${numericYear} ${cleanMake} ${cleanModel}`.replace(/\s+/g, ' ').trim(),
  });
  if (!warning) return null;
  return (
    <p role="status" className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>Price check (FOB): {warning} You can still save.</span>
    </p>
  );
}
