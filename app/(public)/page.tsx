import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { buildPageMetadata } from '@/lib/seo';
import { getHomeFeaturedData } from '@/lib/home-featured';
import { getPublishedReviews } from '@/lib/reviews';
import HomePageClient from './home-page-client';

export const revalidate = 600;

export const metadata: Metadata = buildPageMetadata({
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
  path: '/',
  absoluteTitle: true,
});

export default async function HomePage() {
  const [reviews, featured] = await Promise.all([getPublishedReviews(4), getHomeFeaturedData()]);
  return <HomePageClient initialReviews={reviews} initialFeatured={featured} />;
}
