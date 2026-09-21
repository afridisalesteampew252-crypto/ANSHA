import type { Metadata } from 'next';
import { siteConfig } from '@/lib/site-config';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact Us',
  description: `Contact ${siteConfig.name} in Dubai about vehicles, parts, machinery, or export inquiries — phone, email, or WhatsApp.`,
  path: '/contact',
});

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
