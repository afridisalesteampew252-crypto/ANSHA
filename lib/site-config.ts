export const siteConfig = {
  name: 'ANSHA TRADING',
  shortName: 'ANSHA',
  /** Installed PWA display name (homescreen / install UI). */
  pwaName: 'Anshatradingco APP',
  pwaShortName: 'Anshatradingco APP',
  tagline: 'Global Vehicles and Automotive Parts Exporter',
  description:
    'Global exporter of vehicles and automotive parts for all brands. Search inventory by OEM part number, chassis code, engine code, make, model, and year.',
  whatsappNumber: '971501677980',
  whatsappDisplay: '+971 50 167 7980',
  email: 'info@anshatrading.com',
  phone: '+971 50 167 7980',
  address: 'Meydan Grandstand, 6th Floor, Meydan Road, Nad Al Sheba, Dubai, U.A.E.',
  taxRegistrationNumber: '105335274400003',
  url: 'https://www.anshatradingco.com',
  /** GA4 measurement ID (public). Prefer NEXT_PUBLIC_GA_MEASUREMENT_ID; this is the production fallback / cookie-policy label. */
  googleAnalyticsId: 'G-T40ZE27E73',
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
