import type { NextConfig } from 'next';

import path from 'node:path';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@afyalink/shared'],
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // In development the API runs separately; in production Nginx routes /api to the API container.
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${API_INTERNAL_URL}/api/v1/:path*` },
      { source: '/api/docs/:path*', destination: `${API_INTERNAL_URL}/api/docs/:path*` },
      { source: '/api/docs', destination: `${API_INTERNAL_URL}/api/docs` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
