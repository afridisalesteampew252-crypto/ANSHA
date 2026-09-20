import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Heavy Machinery & Trucks',
  description: `Browse export-ready excavators, loaders, commercial trucks, and heavy equipment from ${siteConfig.name} — stock across Japan, Dubai, Singapore, China, Thailand, and Taiwan.`,
  alternates: { canonical: '/machinery' },
  openGraph: {
    title: `Heavy Machinery & Trucks | ${siteConfig.name}`,
    description: `Inspected machinery and trucks ready for worldwide shipping coordination.`,
    url: `${siteConfig.url}/machinery`,
  },
};

export default function MachineryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
