import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Insights & Buying Guides',
  description:
    'Practical guides on used Japanese cars, Japan auction sheets, OEM auto parts, keyless remotes, heavy machinery, and export from Dubai — from ANSHA TRADING.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: `Insights & Buying Guides | ${siteConfig.name}`,
    description:
      'Exporter guides for Japanese vehicles, auto parts Dubai buyers, and machinery sourcing.',
    url: `${siteConfig.url}/blog`,
    type: 'website',
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
