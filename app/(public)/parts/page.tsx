import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { buildListingPageMetadata, type SearchParamsRecord } from '@/lib/seo';
import {
  fetchPartsCatalogPage,
  fetchPublicCategories,
  parsePartsCatalogFilters,
  toUrlSearchParams,
} from '@/lib/catalog-queries';
import { createPublicSupabaseClient } from '@/lib/supabase/public';
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

export default async function PartsPage({ searchParams }: Props) {
  // Server-render the first page so listings (and the heading) are in the initial HTML.
  const filters = parsePartsCatalogFilters(toUrlSearchParams(await searchParams));
  const supabase = createPublicSupabaseClient();
  const categories = await fetchPublicCategories(supabase);
  const categoryId = categories.find((item) => item.slug === filters.category)?.id;
  const { items, count, error } = await fetchPartsCatalogPage(supabase, filters, categoryId);
  return <PartsCatalogPage initial={error ? undefined : { filters, categories, items, count }} />;
}
