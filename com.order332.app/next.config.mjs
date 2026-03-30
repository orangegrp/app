import withPWA from '@ducanh2912/next-pwa'

const withPWAConfig = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  fallbacks: { document: '/offline' },
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // Multi‑GiB VM disk images must not be precached (local copy under public/webpc-disks;
  // production may stream from R2 presigned URLs instead).
  publicExcludes: ['!noprecache/**/*', '!webpc-disks/**'],
  /**
   * Default next-pwa runtime caching uses StaleWhileRevalidate for all *.js.
   * That can serve stale or empty cached chunks for CheerpX dynamic imports
   * (e.g. tun/tailscale_tun_auto.js), breaking the VM. Always use network.
   */
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        // API routes must never be served from cache — stale auth responses
        // (e.g. /api/me after logout) would be a security issue.
        urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
        options: {
          cacheName: 'api-network-only',
        },
      },
      {
        urlPattern: ({ sameOrigin, url }) =>
          sameOrigin &&
          (url.pathname.includes('/cheerpx/') || url.pathname.endsWith('/cheerpx')),
        handler: 'NetworkOnly',
        method: 'GET',
        options: {
          cacheName: 'cheerpx-network-only',
        },
      },
    ],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_DEPLOYMENT_ID
      ? await import('crypto').then(c => c.createHash('md5').update(process.env.VERCEL_DEPLOYMENT_ID).digest('hex'))
      : (process.env.NEXT_PUBLIC_APP_VERSION || 'dev'),
  },
  turbopack: {},
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.discordapp.com', pathname: '/avatars/**' },
      { protocol: 'https', hostname: 'cdn.discordapp.com', pathname: '/embed/**' },
    ],
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // unsafe-inline/unsafe-eval are required by Next.js (inline scripts) and Tailwind (style injection).
      // frame-ancestors 'none' duplicates X-Frame-Options for CSP-aware browsers.
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "img-src 'self' cdn.discordapp.com data: blob:",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self'",
          "connect-src 'self'",
          "frame-ancestors 'none'",
        ].join('; '),
      },
    ]
    // Fallback for environments where middleware doesn't run (e.g. static export).
    // Middleware is the primary mechanism; console-only COEP/COOP for CheerpX.
    const isolationHeaders = [
      { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ]
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/webpc/:sessionId/console', headers: isolationHeaders },
    ]
  },
}

export default withPWAConfig(nextConfig)
