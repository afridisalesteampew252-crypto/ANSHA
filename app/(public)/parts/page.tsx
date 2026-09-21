import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { buildListingPageMetadata, type SearchParamsRecord } from '@/lib/seo';
import PartsCatalogPage from './parts-catalog';

type Props = {
  searchParams: Promise<SearchParamsRecord>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildListingPageMetadata({
    title: 'Automotive Parts Catalog',
    description: `Search published ${siteConfig.name} parts by OEM number, brand, chassis code, and category for export from Dubai.`,
    path: '/parts',
    searchParams: await searchParams,
  });
}

export default function PartsPage() {
  return <PartsCatalogPage />;
}
