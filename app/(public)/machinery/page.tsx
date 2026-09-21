import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { buildListingPageMetadata, type SearchParamsRecord } from '@/lib/seo';
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

export default function MachineryPage() {
  return <MachineryCatalog />;
}
