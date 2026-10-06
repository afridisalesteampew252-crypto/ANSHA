const DEFAULT_SITE_URL = 'https://www.anshatradingco.com';

/** Canonical production origin. Prefers NEXT_PUBLIC_SITE_URL; never use preview/localhost as canonical. */
function resolveSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!fromEnv) return DEFAULT_SITE_URL;
  return fromEnv.replace(/\/$/, '');
}

export const siteConfig = {
  name: 'ANSHA TRADING',
  shortName: 'ANSHA',
  /** Installed PWA display name (homescreen / install UI). */
  pwaName: 'Anshatradingco APP',
  pwaShortName: 'Anshatradingco APP',
  tagline: 'Global Vehicles, Parts & Machinery Exporter',
  description:
    'Dubai-based global exporter of vehicles, automotive parts, and heavy machinery. Browse published stock by make, model, year, OEM number, chassis code, and stock origin.',
  whatsappNumber: '971501677980',
  whatsappDisplay: '+971 50 167 7980',
  email: 'info@anshatradingco.com',
  phone: '+971 50 167 7980',
  address: 'Meydan Grandstand, 6th Floor, Meydan Road, Nad Al Sheba, Dubai, U.A.E.',
  taxRegistrationNumber: '105335274400003',
  url: resolveSiteUrl(),
  /** GTM container ID (public). Prefer NEXT_PUBLIC_GTM_ID; this is the production fallback / cookie-policy label. */
  gtmId: 'GTM-TFSZD9WT',
};

export const conditionLabels: Record<string, string> = {
  new: 'New',
  used: 'Used',
  refurbished: 'Refurbished',
  'for-parts': 'For Parts',
};

export const conditionBadgeClasses: Record<string, string> = {
  new: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  used: 'bg-blue-50 text-blue-700 border-blue-200',
  refurbished: 'bg-amber-50 text-amber-700 border-amber-200',
  'for-parts': 'bg-stone-100 text-stone-600 border-stone-200',
};

export const inquiryStatusLabels: Record<string, string> = {
  new: 'New',
  read: 'Read',
  responded: 'Responded',
  closed: 'Closed',
};
