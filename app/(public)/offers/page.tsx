import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { buildPageMetadata } from '@/lib/seo';
import PublicOffersPage from './offers-client';

export const metadata: Metadata = buildPageMetadata({
  title: 'Deals and Offers',
  description: `Current export deals and offers from ${siteConfig.name} on published vehicles, parts, and machinery.`,
  path: '/offers',
});

export default function OffersPage() {
  return <PublicOffersPage />;
}
