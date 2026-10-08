'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { EXPORT_MARKETS, flagImageUrl, type ExportMarket } from '@/lib/export-markets';

const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'] as const;
type Continent = (typeof CONTINENTS)[number];

const SOUTH_AMERICA_CODES = new Set(['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE']);

function continentForMarket(market: ExportMarket): Continent {
  if (market.region === 'Africa') return 'Africa';
  if (market.region === 'Asia' || market.region === 'Middle East') return 'Asia';
  if (market.region === 'Europe') return 'Europe';
  if (market.region === 'Oceania') return 'Oceania';
  if (market.region === 'Caribbean') return 'North America';
  if (market.region === 'Americas') {
    return SOUTH_AMERICA_CODES.has(market.code) ? 'South America' : 'North America';
  }
  return 'North America';
}

const SOUTH_AMERICA_TIMEZONES = [
  'Buenos_Aires', 'Argentina', 'Sao_Paulo', 'Bogota', 'Lima', 'Santiago', 'Caracas', 'La_Paz',
  'Montevideo', 'Asuncion', 'Guayaquil', 'Manaus', 'Cayenne', 'Paramaribo', 'Guyana',
];

/** Fallback when the edge doesn't tell us the country: infer the continent from the browser time zone. */
function continentFromTimeZone(): Continent | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const [area, ...rest] = tz.split('/');
    const city = rest.join('/');
    if (area === 'Africa') return 'Africa';
    if (area === 'Asia') return 'Asia';
    if (area === 'Europe') return 'Europe';
    if (area === 'Australia' || area === 'Pacific') return 'Oceania';
    if (area === 'America') {
      return SOUTH_AMERICA_TIMEZONES.some((name) => city.includes(name)) ? 'South America' : 'North America';
    }
    return null;
  } catch {
    return null;
  }
}

export function ExportMarketsStrip() {
  const [selectedContinent, setSelectedContinent] = useState<Continent | null>(null);
  const userPicked = useRef(false);

  // Preselect the visitor's own region (edge country first, browser time zone as fallback).
  useEffect(() => {
    let active = true;
    void (async () => {
      let detected: Continent | null = null;
      try {
        const res = await fetch('/api/geo', { cache: 'no-store' });
        const { country } = (await res.json()) as { country: string | null };
        const market = country ? EXPORT_MARKETS.find((m) => m.code === country) : undefined;
        if (market) detected = continentForMarket(market);
      } catch {
        /* fall through to time zone */
      }
      detected = detected ?? continentFromTimeZone();
      if (active && detected && !userPicked.current) setSelectedContinent(detected);
    })();
    return () => {
      active = false;
    };
  }, []);
  const continentCounts = useMemo(
    () => Object.fromEntries(CONTINENTS.map((continent) => [
      continent,
      EXPORT_MARKETS.filter((market) => continentForMarket(market) === continent).length,
    ])) as Record<Continent, number>,
    []
  );
  const visibleMarkets = useMemo(
    () => EXPORT_MARKETS
      .filter((market) => selectedContinent && continentForMarket(market) === selectedContinent)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [selectedContinent]
  );

  return (
    <section
      id="export-markets"
      className="surface-mist max-w-full overflow-x-clip border-y border-accent/15 py-7 sm:py-9"
      aria-labelledby="export-markets-heading"
    >
      <div className="container-page min-w-0 max-w-full">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="min-w-0">
            <span className="eyebrow">Export markets</span>
            <h2 id="export-markets-heading" className="mt-1 text-lg font-extrabold tracking-tight sm:text-xl">
              We ship worldwide from Dubai
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Choose a continent to browse import notes and vehicles for each destination.
            </p>
          </div>
        </div>

        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Browse export markets by continent">
          {CONTINENTS.map((continent) => {
            const selected = selectedContinent === continent;
            return (
              <button
                key={continent}
                type="button"
                onClick={() => {
                  userPicked.current = true;
                  setSelectedContinent(selected ? null : continent);
                }}
                aria-pressed={selected}
                className={selected
                  ? 'min-h-10 rounded-full border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm'
                  : 'min-h-10 rounded-full border border-border/80 bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-accent/5'}
              >
                {continent}
                <span className="ml-2 text-xs opacity-75">{continentCounts[continent]}</span>
              </button>
            );
          })}
        </nav>

        {selectedContinent ? (
          <div className="mt-4 rounded-2xl border border-accent/10 bg-card/70 p-3 sm:p-4">
            <h3 className="mb-3 text-sm font-bold">{selectedContinent} destinations</h3>
            <ul className="flex min-w-0 max-w-full flex-wrap gap-2" role="list">
              {visibleMarkets.map((market) => (
                <li key={market.code} className="shrink-0">
                  <Link
                    href={`/markets/${market.code.toLowerCase()}`}
                    className="chip-market"
                    title={`${market.name} — import policy & destination picks`}
                  >
                    <Image
                      src={flagImageUrl(market.code)}
                      alt=""
                      width={24}
                      height={18}
                      className="h-[18px] w-6 shrink-0 rounded-[2px] object-cover shadow-sm ring-1 ring-black/10"
                      unoptimized
                    />
                    <span className="whitespace-nowrap text-[12px] sm:text-[13px]">{market.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-accent/20 px-4 py-5 text-sm text-muted-foreground">
            Select a continent to see its destination countries.
          </p>
        )}
      </div>
    </section>
  );
}
