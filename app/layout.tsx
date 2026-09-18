import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { siteConfig } from '@/lib/site-config';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { JsonLd } from '@/components/seo/json-ld';
import { ThemeProvider } from '@/components/theme-provider';
import { RegisterServiceWorker } from '@/components/pwa/register-service-worker';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: `${siteConfig.name} — Global Vehicles & Auto Parts Exporter`, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  openGraph: { title: `${siteConfig.name} — Global Vehicles & Auto Parts Exporter`, description: siteConfig.description, url: siteConfig.url, siteName: siteConfig.name, type: 'website' },
  metadataBase: new URL(siteConfig.url),
  twitter: { card: 'summary_large_image', title: siteConfig.name, description: siteConfig.description },
  robots: { index: true, follow: true },
  applicationName: siteConfig.shortName,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: siteConfig.shortName,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#D21E1E' },
    { media: '(prefers-color-scheme: dark)', color: '#D21E1E' },
  ],
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body className={inter.className}><ThemeProvider>
    <JsonLd data={[
      {
        '@context': 'https://schema.org', '@type': 'Organization', name: siteConfig.name,
        url: siteConfig.url, email: siteConfig.email, telephone: siteConfig.phone,
        description: siteConfig.description, taxID: siteConfig.taxRegistrationNumber,
        address: { '@type': 'PostalAddress', streetAddress: 'Meydan Grandstand, 6th Floor, Meydan Road, Nad Al Sheba', addressLocality: 'Dubai', addressCountry: 'AE' },
      },
      {
        '@context': 'https://schema.org', '@type': 'WebSite', name: siteConfig.name, url: siteConfig.url,
        potentialAction: { '@type': 'SearchAction', target: `${siteConfig.url}/parts?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
      },
    ]} />
    <TooltipProvider delayDuration={200}>{children}<Toaster /></TooltipProvider>
    <RegisterServiceWorker />
    <GoogleAnalytics />
    <Analytics /><SpeedInsights />
  </ThemeProvider></body></html>;
}
