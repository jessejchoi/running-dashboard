/** @type {import('next').NextConfig} */
const nextConfig = {
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
