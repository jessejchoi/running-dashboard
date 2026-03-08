/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 300,  // cache server pages for 5 min
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
