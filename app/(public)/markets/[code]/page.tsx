import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getExportMarket } from '@/lib/export-markets';
import { buildPageMetadata, sanitizeDescription } from '@/lib/seo';
import { siteConfig } from '@/lib/site-config';
import { createPublicSupabaseClient } from '@/lib/supabase/public';
import type { VehicleWithPhotos } from '@/lib/types';
import MarketPageClient from './market-page-client';

type Props = {
  params: Promise<{ code: string }>;
};

const loadMarketInventory = cache(async (code: string) => {
  const supabase = createPublicSupabaseClient();
  const [{ data: vehicles }, { data: config }, { count }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('*, vehicle_photos(*)')
      .eq('is_published', true)
      .eq('stock_status', 'available')
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('export_market_configs')
      .select('import_policy, freight_notes, exchange_rate_note')
      .eq('country_code', code)
      .maybeSingle(),
    supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', true)
      .eq('stock_status', 'available'),
  ]);

  return {
    vehicles: (vehicles || []) as unknown as VehicleWithPhotos[],
    config:
      (config as {
        import_policy: string | null;
        freight_notes: string | null;
        exchange_rate_note: string | null;
      } | null) ?? null,
    inventoryCount: count ?? 0,
  };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code: raw } = await params;
  const market = getExportMarket(raw);
  if (!market) {
    return {
      title: 'Market not found',
      robots: { index: false, follow: false },
    };
  }

  const { inventoryCount } = await loadMarketInventory(market.code);
  const empty = inventoryCount < 1;
  const path = `/markets/${market.code.toLowerCase()}`;
  const description = sanitizeDescription(
    empty
      ? `${siteConfig.name} export destination notes for ${market.name}. Published vehicle inventory is currently empty — contact us for sourcing.`
      : `${siteConfig.name} export support for ${market.name}: browse published vehicles and destination notes. Confirm local import rules with your broker.`
  );

  return buildPageMetadata({
    title: `Export to ${market.name}`,
    description,
    path,
    noIndex: empty,
    followWhenNoIndex: true,
  });
}

export default async function MarketDestinationPage({ params }: Props) {
  const { code: raw } = await params;
  const market = getExportMarket(raw);
  if (!market) notFound();

  const { vehicles, config } = await loadMarketInventory(market.code);

  return <MarketPageClient market={market} vehicles={vehicles} config={config} />;
}
