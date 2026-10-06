import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { buildListingPageMetadata, type SearchParamsRecord } from '@/lib/seo';
import {
  fetchMachineryCatalog,
  parseMachineryCatalogFilters,
  toUrlSearchParams,
} from '@/lib/catalog-queries';
import { createPublicSupabaseClient } from '@/lib/supabase/public';
import MachineryCatalog from './machinery-catalog';

type Props = {
  searchParams: Promise<SearchParamsRecord>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildListingPageMetadata({
    title: 'Heavy Machinery & Trucks',
    description: `Browse export-ready excavators, loaders, commercial trucks, and heavy equipment from ${siteConfig.name} — stock across Japan, Dubai, Singapore, China, Thailand, and Taiwan.`,
    path: '/machinery',
    searchParams: await searchParams,
  });
}

export default async function MachineryPage({ searchParams }: Props) {
  // Server-render the list so listings are in the initial HTML (crawlers, no-JS).
  const filters = parseMachineryCatalogFilters(toUrlSearchParams(await searchParams));
  const { items, error } = await fetchMachineryCatalog(createPublicSupabaseClient(), filters);
  return <MachineryCatalog initial={error ? undefined : { filters, items }} />;
}
