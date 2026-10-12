import type { NextConfig } from 'next'

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000'

// Une seule origine pour le navigateur : /api/* est relayé vers l'API (cookies httpOnly, pas de CORS ouvert).
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@cepca/shared', '@cepca/tokens'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default config
