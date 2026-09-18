import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import CategoriesPageClient from './categories-client';

export const metadata: Metadata = {
  title: 'Parts Categories',
  description: `Browse ${siteConfig.name} automotive parts by category — engines, body, electrical, and more from global stock.`,
  alternates: { canonical: '/categories' },
  openGraph: {
    title: `Parts Categories | ${siteConfig.name}`,
    description: `Explore published inventory by automotive system and product family.`,
    url: `${siteConfig.url}/categories`,
  },
};

export default function CategoriesPage() {
  return <CategoriesPageClient />;
}
