import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.railway.app' },
      { protocol: 'https', hostname: 'img.clerk.com' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/fastapi/:path*',
        destination: `${process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'}/api/:path*`,
      },
      {
        source: '/fastapi-data/:path*',
        destination: `${process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'}/data/:path*`,
      },
    ]
  },
}

export default nextConfig
