import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import HomePageClient from './home-page-client';

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name} — Global Vehicles & Auto Parts Exporter` },
  description: siteConfig.description,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${siteConfig.name} — Global Vehicles & Auto Parts Exporter`,
    description: siteConfig.description,
    url: siteConfig.url,
  },
};

export default function HomePage() {
  return <HomePageClient />;
}
