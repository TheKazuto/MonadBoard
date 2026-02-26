/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Not needed since we use <img> native, but kept for reference
    domains: [
      'assets.coingecko.com',
      'coin-images.coingecko.com',
      'tokens.1inch.io',
      'raw.githubusercontent.com',
      'api.geckoterminal.com',
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            // Allow images from all token logo CDNs
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https: http:",  // allow all HTTPS image sources
              "connect-src 'self' https: wss:",           // allow all HTTPS API calls
            ].join('; '),
          },
        ],
      },
    ]
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

module.exports = nextConfig
