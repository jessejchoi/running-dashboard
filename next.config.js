/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 0,    // Reflect saved goals/plans on navigation; expensive analysis is cached in PostgreSQL
      static: 300,
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
