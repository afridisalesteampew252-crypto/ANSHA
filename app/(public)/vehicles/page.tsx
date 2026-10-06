import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { buildListingPageMetadata, type SearchParamsRecord } from '@/lib/seo';
import {
  fetchVehicleCatalogPage,
  parseVehicleCatalogFilters,
  toUrlSearchParams,
} from '@/lib/catalog-queries';
import { createPublicSupabaseClient } from '@/lib/supabase/public';
import VehiclesCatalog from './vehicles-catalog';

type Props = {
  searchParams: Promise<SearchParamsRecord>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildListingPageMetadata({
    title: 'Export Vehicles',
    description: `Browse published ${siteConfig.name} vehicles for export — stock from Japan, Dubai, Singapore, China, Thailand, and Taiwan.`,
    path: '/vehicles',
    searchParams: await searchParams,
  });
}

export default async function VehiclesPage({ searchParams }: Props) {
  // Server-render the first page so listings are in the initial HTML (crawlers, no-JS).
  const filters = parseVehicleCatalogFilters(toUrlSearchParams(await searchParams));
  const { items, count, error } = await fetchVehicleCatalogPage(createPublicSupabaseClient(), filters);
  // On a query error fall back to the client-side fetch instead of rendering "0 vehicles".
  return <VehiclesCatalog initial={error ? undefined : { filters, items, count }} />;
}
