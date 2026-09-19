'use client';

import Image from 'next/image';
import Link from 'next/link';
import { EXPORT_MARKETS, flagImageUrl } from '@/lib/export-markets';

export function ExportMarketsStrip() {
  return (
    <section
      className="max-w-full overflow-x-clip border-y border-border bg-background py-6 sm:py-8"
      aria-labelledby="export-markets-heading"
    >
      <div className="container-page min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <span className="eyebrow">Export markets</span>
            <h2 id="export-markets-heading" className="mt-1 text-lg font-extrabold tracking-tight sm:text-xl">
              We ship worldwide from Dubai
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Tap a flag for import notes and popular vehicles for that destination.
            </p>
          </div>
        </div>

        <ul
          className="mt-4 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain touch-pan-x pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mt-5 sm:flex-wrap sm:overflow-visible sm:touch-auto [&::-webkit-scrollbar]:hidden"
          role="list"
        >
          {EXPORT_MARKETS.map((market) => (
            <li key={market.code} className="shrink-0">
              <Link
                href={`/markets/${market.code.toLowerCase()}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-semibold shadow-sm transition hover:border-accent hover:text-accent active:scale-[0.98]"
                title={`${market.name} — import policy & hot vehicles`}
              >
                <Image
                  src={flagImageUrl(market.code)}
                  alt=""
                  width={24}
                  height={18}
                  className="h-[18px] w-6 shrink-0 rounded-[2px] object-cover shadow-sm ring-1 ring-black/10"
                  unoptimized
                />
                <span className="sr-only">{market.name}</span>
                <span aria-hidden="true" className="whitespace-nowrap text-[12px] sm:text-[13px]">
                  {market.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
