import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { defaultOgImage } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Automotive Parts Catalog',
  description: `Search published ${siteConfig.name} parts by OEM number, brand, chassis code, and category for export from Dubai.`,
  alternates: { canonical: '/parts' },
  openGraph: {
    title: `Automotive Parts Catalog | ${siteConfig.name}`,
    description: `Browse verified automotive parts ready for export.`,
    url: `${siteConfig.url}/parts`,
    images: [defaultOgImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Automotive Parts Catalog | ${siteConfig.name}`,
    images: [defaultOgImage.url],
  },
};

export default function PartsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
