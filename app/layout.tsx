import './globals.css';
import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Outfit, Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { siteConfig } from '@/lib/site-config';
import { defaultOgImage, favicon48Path } from '@/lib/seo';
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from '@/lib/seo-schema';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { JsonLd } from '@/components/seo/json-ld';
import { ThemeProvider } from '@/components/theme-provider';
import { RegisterServiceWorker } from '@/components/pwa/register-service-worker';

/** Body: Plus Jakarta Sans — clear marketplace UI (Amazon Ember / eBay Market Sans energy). */
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

/** Display: Outfit — strong geometric headlines for commerce scanability. */
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: `${siteConfig.name} — ${siteConfig.tagline}`, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  openGraph: {
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: 'website',
    locale: 'en_AE',
    images: [defaultOgImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.name,
    description: siteConfig.description,
    images: [defaultOgImage.url],
  },
  robots: { index: true, follow: true },
  verification: {
    google: 'r0P5yQPkoLo-6HNp_VwC651U3Opl_c3wXvmSTbbUm2A',
  },
  applicationName: siteConfig.pwaName,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: siteConfig.pwaShortName,
  },
  icons: {
    // Stable /favicon.ico + 48×48 PNG — what Google Search prefers for SERP icons.
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: favicon48Path, sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
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
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider>
          {/* Organization + WebSite only here — avoid duplicate graphs on child pages */}
          <JsonLd data={[buildOrganizationJsonLd(), buildWebSiteJsonLd()]} />
          <TooltipProvider delayDuration={200}>{children}<Toaster /></TooltipProvider>
          <RegisterServiceWorker />
          <Analytics /><SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
