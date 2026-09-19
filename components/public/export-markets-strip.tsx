const MARKETS = [
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
] as const;

export function ExportMarketsStrip() {
  return (
    <section className="border-y border-border bg-background py-6 sm:py-8" aria-labelledby="export-markets-heading">
      <div className="container-page">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <span className="eyebrow">Export markets</span>
            <h2 id="export-markets-heading" className="mt-1 text-lg font-extrabold tracking-tight sm:text-xl">
              We ship worldwide from Dubai
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Active destinations across the Middle East, Africa, Asia, and Europe.
            </p>
          </div>
        </div>

        <ul
          className="mt-4 flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mt-5 sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
          role="list"
        >
          {MARKETS.map((market) => (
            <li key={market.code} className="shrink-0">
              <span
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-semibold shadow-sm"
                title={market.name}
              >
                <span className="text-base leading-none" aria-hidden="true">{market.flag}</span>
                <span className="sr-only">{market.name}</span>
                <span aria-hidden="true" className="whitespace-nowrap text-[12px] sm:text-[13px]">
                  {market.name}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
