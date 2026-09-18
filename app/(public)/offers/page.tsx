import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import PublicOffersPage from './offers-client';

export const metadata: Metadata = {
  title: 'Deals and Offers',
  description: `Current export deals and offers from ${siteConfig.name}.`,
  alternates: { canonical: '/offers' },
};

export default function OffersPage() {
  return <PublicOffersPage />;
}
