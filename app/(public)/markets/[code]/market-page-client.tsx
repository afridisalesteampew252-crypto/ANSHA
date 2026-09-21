'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Ship } from 'lucide-react';
import { VehicleCard } from '@/components/public/vehicle-card';
import { useInventoryDeals } from '@/hooks/use-inventory-deals';
import { flagImageUrl, type ExportMarket } from '@/lib/export-markets';
import type { VehicleWithPhotos } from '@/lib/types';

type MarketConfig = {
  import_policy: string | null;
  freight_notes: string | null;
  exchange_rate_note: string | null;
};

type Props = {
  market: ExportMarket;
  vehicles: VehicleWithPhotos[];
  config: MarketConfig | null;
};

export default function MarketPageClient({ market, vehicles, config }: Props) {
  const { dealForVehicle } = useInventoryDeals();

  /** Prefer admin-configured notes; fall back to catalog guidance — never invent duty/tax rates. */
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
              alt={`${market.name} flag`}
              width={64}
              height={48}
              className="mt-1 h-12 w-16 rounded-md object-cover shadow-lg ring-1 ring-white/20"
              unoptimized
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{market.region}</p>
              <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                Export to {market.name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Published vehicles buyers often review for {market.name}, plus destination notes from ANSHA.
                Confirm import rules with your local broker before purchase.
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
                <h2 className="text-sm font-bold uppercase tracking-wide">Destination notes</h2>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{policy}</p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Guidance only — not legal advice. Duties, inspections, and age limits change; verify with your
                destination customs broker.
              </p>
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
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Exchange / pricing notes
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{fx}</p>
                  </div>
                ) : null}
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/vehicles" className="font-semibold text-accent hover:underline">
                Browse vehicles
              </Link>
              <Link href="/machinery" className="font-semibold text-accent hover:underline">
                Machinery &amp; trucks
              </Link>
              <Link href="/parts" className="font-semibold text-accent hover:underline">
                Parts catalog
              </Link>
              <Link href="/contact" className="font-semibold text-accent hover:underline">
                Contact export desk
              </Link>
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Published stock</p>
                <h2 className="text-xl font-extrabold tracking-tight">Vehicles for {market.name}</h2>
              </div>
              <Link href="/vehicles" className="text-sm font-semibold text-accent hover:underline">
                View all
              </Link>
            </div>
            {vehicles.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {vehicles.slice(0, 6).map((vehicle) => (
                  <VehicleCard key={vehicle.id} vehicle={vehicle} deal={dealForVehicle(vehicle.id)} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-accent/20 bg-card p-6 text-sm text-muted-foreground">
                No published available vehicles right now. Browse the{' '}
                <Link href="/vehicles" className="font-semibold text-accent hover:underline">
                  vehicle catalog
                </Link>{' '}
                or{' '}
                <Link href="/contact" className="font-semibold text-accent hover:underline">
                  contact ANSHA
                </Link>{' '}
                with your destination brief.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
