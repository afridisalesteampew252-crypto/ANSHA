'use client';

import Image from 'next/image';
import Link from 'next/link';
import { EXPORT_MARKETS, flagImageUrl } from '@/lib/export-markets';

export function ExportMarketsStrip() {
  return (
    <section
      id="export-markets"
      className="max-w-full overflow-x-clip border-y border-[#cdbfc1]/40 bg-white/40 py-12 sm:py-16"
      aria-labelledby="export-markets-heading"
    >
      <div className="container-page min-w-0 max-w-full text-center">
        <div className="mx-auto min-w-0 max-w-2xl">
          <span className="eyebrow">Export markets</span>
          <h2 id="export-markets-heading" className="mt-2 font-display text-2xl font-bold text-[#171415] sm:text-3xl">
            Destinations we serve
          </h2>
          <p className="mt-2 text-sm text-[#5c6366]">
            Tap a market for import notes and popular vehicles for that destination.
          </p>
        </div>

        <div className="mt-8 min-w-0 max-w-full overflow-x-hidden sm:overflow-visible">
          <ul
            className="flex min-w-0 max-w-full justify-start gap-2 overflow-x-auto overscroll-x-contain touch-pan-x pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:touch-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="list"
          >
            {EXPORT_MARKETS.map((market) => (
              <li key={market.code} className="shrink-0">
                <Link
                  href={`/markets/${market.code.toLowerCase()}`}
                  className="chip-market"
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
      </div>
    </section>
  );
}
