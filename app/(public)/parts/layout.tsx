import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Automotive Parts Catalog',
  description: `Search published ${siteConfig.name} parts by OEM number, brand, chassis code, and category for export from Dubai.`,
  alternates: { canonical: '/parts' },
  openGraph: {
    title: `Automotive Parts Catalog | ${siteConfig.name}`,
    description: `Browse verified automotive parts ready for export.`,
    url: `${siteConfig.url}/parts`,
  },
};

export default function PartsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
