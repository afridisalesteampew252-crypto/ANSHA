import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { buildPageMetadata } from '@/lib/seo';
import { getPublishedReviews } from '@/lib/reviews';
import HomePageClient from './home-page-client';

export const metadata: Metadata = buildPageMetadata({
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
  path: '/',
  absoluteTitle: true,
});

export default async function HomePage() {
  const reviews = await getPublishedReviews(4);
  return <HomePageClient initialReviews={reviews} />;
}
