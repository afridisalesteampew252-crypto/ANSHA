import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Export Vehicles',
  description: `Browse published ${siteConfig.name} vehicles for export — stock from Japan, Dubai, Singapore, China, Thailand, and Taiwan.`,
  alternates: { canonical: '/vehicles' },
  openGraph: {
    title: `Export Vehicles | ${siteConfig.name}`,
    description: `Inspected vehicles ready for worldwide shipping coordination.`,
    url: `${siteConfig.url}/vehicles`,
  },
};

export default function VehiclesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
