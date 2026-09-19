'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Ship } from 'lucide-react';
import { VehicleCard } from '@/components/public/vehicle-card';
import { useInventoryDeals } from '@/hooks/use-inventory-deals';
import { flagImageUrl, getExportMarket } from '@/lib/export-markets';
import { supabase } from '@/lib/supabase/client';
import type { VehicleWithPhotos } from '@/lib/types';

type MarketConfig = {
  import_policy: string | null;
  freight_notes: string | null;
  exchange_rate_note: string | null;
};

export default function MarketDestinationPage() {
  const params = useParams<{ code: string }>();
  const code = String(params?.code || '').toUpperCase();
  const market = getExportMarket(code);
  const { dealForVehicle } = useInventoryDeals();
  const [vehicles, setVehicles] = useState<VehicleWithPhotos[]>([]);
  const [config, setConfig] = useState<MarketConfig | null>(null);
  const [loading, setLoading] = useState(Boolean(market));

  useEffect(() => {
    if (!market) return;
    let cancelled = false;

    (async () => {
      const [vehiclesRes, configRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select('*, vehicle_photos(*)')
          .eq('status', 'published')
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('export_market_configs')
          .select('import_policy, freight_notes, exchange_rate_note')
          .eq('country_code', market.code)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      setVehicles((vehiclesRes.data as VehicleWithPhotos[]) || []);
      setConfig((configRes.data as MarketConfig | null) ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [market]);

  if (!market) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-2xl font-bold">Market not found</h1>
        <Link href="/" className="mt-4 inline-block text-accent hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  const policy = config?.import_policy?.trim() || market.defaultImportNotes;
  const freight = config?.freight_notes?.trim();
  const fx = config?.exchange_rate_note?.trim();

  return (
    <div>
      <section className="page-band">
        <div className="container-page py-8 sm:py-10">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
          <div className="mt-5 flex items-start gap-4">
            <Image
              src={flagImageUrl(market.code, 160)}
              alt=""
              width={64}
              height={48}
              className="mt-1 h-12 w-16 rounded-md object-cover shadow-lg ring-1 ring-white/20"
              unoptimized
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{market.region}</p>
              <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{market.name}</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Import guidance from Dubai, plus vehicles buyers in this market often request.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-mist border-t border-accent/10">
      <div className="container-page grid gap-8 py-8 sm:py-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="catalog-panel p-5 sm:p-6">
            <div className="flex items-center gap-2 text-accent">
              <Ship className="h-4 w-4" />
              <h2 className="text-sm font-bold uppercase tracking-wide">Import policy</h2>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{policy}</p>
          </div>
          {(freight || fx) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {freight ? (
                <div className="catalog-panel p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Freight</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{freight}</p>
                </div>
              ) : null}
              {fx ? (
                <div className="catalog-panel p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Exchange / pricing notes</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{fx}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Hot favourites</p>
              <h2 className="text-xl font-extrabold tracking-tight">Vehicles for {market.name}</h2>
            </div>
            <Link href="/vehicles" className="text-sm font-semibold text-accent hover:underline">
              View all
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[.85] animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : vehicles.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {vehicles.slice(0, 6).map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} deal={dealForVehicle(vehicle.id)} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-accent/20 bg-card p-6 text-sm text-muted-foreground">
              No published vehicles yet. Browse the catalog or WhatsApp ANSHA with your destination brief.
            </p>
          )}
        </div>
      </div>
      </section>
    </div>
  );
}
