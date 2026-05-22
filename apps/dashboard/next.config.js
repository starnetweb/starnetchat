/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't fail the build on TypeScript or ESLint errors
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:4000'
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${apiUrl}/uploads/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
