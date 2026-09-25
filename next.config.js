/** @type {import('next').NextConfig} */
const nextConfig = {
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
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
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
