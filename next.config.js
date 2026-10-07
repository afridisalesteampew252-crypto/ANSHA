/**
 * Content-Security-Policy in REPORT-ONLY mode: browsers log violations to the console but
 * block nothing. Review violations (DevTools console on key pages, with GTM/Tawk active)
 * before switching the header name to `Content-Security-Policy`.
 */
function supabaseOrigins() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://spmnxwhwsgpaoiklezex.supabase.co');
    return [`https://${url.host}`, `wss://${url.host}`];
  } catch {
    return ['https://spmnxwhwsgpaoiklezex.supabase.co', 'wss://spmnxwhwsgpaoiklezex.supabase.co'];
  }
}

const cspReportOnly = [
  "default-src 'self'",
  // Next.js inline bootstrap scripts + GTM custom tags need 'unsafe-inline' until nonces are added.
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://*.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://embed.tawk.to https://*.tawk.to https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://*.tawk.to https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://*.tawk.to https://fonts.gstatic.com",
  [
    "connect-src 'self'",
    ...supabaseOrigins(),
    'https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://gtm-tfszd9wt.fps.goog',
    'https://*.tawk.to wss://*.tawk.to',
    'https://va.vercel-scripts.com https://vitals.vercel-insights.com',
  ].join(' '),
  "frame-src 'self' https://*.tawk.to https://www.googletagmanager.com https://www.openstreetmap.org https://meet.jit.si",
  `media-src 'self' blob: https://*.tawk.to ${supabaseOrigins()[0]}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

/**
 * Renamed public vehicle slugs -> true HTTP 301 (not 308) so search engines and old links
 * move to the corrected URL. Source of truth: config/vehicle-slug-redirects.json.
 */
const VEHICLE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function vehicleSlugRedirects() {
  const { redirects = [] } = require('./config/vehicle-slug-redirects.json');
  const seen = new Set();
  return redirects.map(({ from, to }) => {
    if (!VEHICLE_SLUG_RE.test(from) || !VEHICLE_SLUG_RE.test(to) || from === to || seen.has(from)) {
      throw new Error(`Invalid vehicle slug redirect: ${from} -> ${to}`);
    }
    seen.add(from);
    return { source: `/vehicles/${from}`, destination: `/vehicles/${to}`, statusCode: 301 };
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  // The admin assistant reads its editable business knowledge file at runtime.
  outputFileTracingIncludes: {
    '/api/admin-assistant': ['./lib/admin-assistant/knowledge.md'],
  },
  // Allow phone/LAN preview of Turbopack HMR during local development.
  allowedDevOrigins: ['192.168.18.18', '10.244.163.42', 'localhost'],
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: '(?:anshatrading\\.com|www\\.anshatrading\\.com|anshatradingco\\.com)',
          },
        ],
        destination: 'https://www.anshatradingco.com/:path*',
        permanent: true,
      },
      ...vehicleSlugRedirects(),
    ];
  },
  /**
   * Google tag gateway (first-party `/metrics`).
   * beforeFiles so Next does not 404 `/metrics?id=…` or 308 `/metrics/` → `/metrics`
   * before the Vercel/fps.goog upstream rewrite. Keep in sync with vercel.json.
   */
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/metrics',
          destination: 'https://gtm-tfszd9wt.fps.goog/metrics',
        },
        {
          source: '/metrics/',
          destination: 'https://gtm-tfszd9wt.fps.goog/metrics/',
        },
        {
          source: '/metrics/:path*',
          destination: 'https://gtm-tfszd9wt.fps.goog/metrics/:path*',
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=(self), payment=()',
          },
          { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/portal',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/portal/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/api/health',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },
  images: {
    // Serve source images directly to avoid Vercel Image Optimization usage.
    // Catalog uploads are already converted to compressed WebP before storage.
    unoptimized: true,
    qualities: [65, 75],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
      },
      {
        protocol: 'https',
        hostname: 'flagcdn.com',
      },
    ],
  },
};

module.exports = nextConfig;
