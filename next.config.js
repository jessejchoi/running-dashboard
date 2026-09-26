/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 0,    // Reflect saved goals on navigation; expensive analysis is cached in PostgreSQL
      static: 300,
    },
    // The Boss Raid share card reads its fonts from disk at runtime.
    outputFileTracingIncludes: {
      '/api/groups/[id]/raid/card': ['./lib/og-fonts/**'],
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ['dgalywyr863hv.cloudfront.net'], // Strava CDN for athlete photos
  },
}

module.exports = nextConfig
