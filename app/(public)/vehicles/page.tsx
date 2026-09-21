import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { buildListingPageMetadata, type SearchParamsRecord } from '@/lib/seo';
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

export default function VehiclesPage() {
  return <VehiclesCatalog />;
}
