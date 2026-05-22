/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't fail the build on TypeScript or ESLint errors
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/api/:path*',
      },
      {
        source: '/uploads/:path*',
        destination: 'http://localhost:4000/uploads/:path*',
      },
    ]
  },
}

module.exports = nextConfig
