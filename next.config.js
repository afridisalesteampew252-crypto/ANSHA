/** @type {import('next').NextConfig} */
const { env: publicEnvironment } = require('./vercel.json');

const nextConfig = {
  env: publicEnvironment,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
      },
    ],
  },
};

module.exports = nextConfig;
