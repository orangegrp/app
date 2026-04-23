import withPWA from "@ducanh2912/next-pwa"
import { withBotId } from "botid/next/config"

const withPWAConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  fallbacks: { document: "/offline" },
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // Multi‑GiB VM disk images must not be precached (local copy under public/webpc-disks;
  // production may stream from R2 presigned URLs instead).
  publicExcludes: ["!noprecache/**/*", "!webpc-disks/**"],
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
        urlPattern: ({ sameOrigin, url }) =>
          sameOrigin && url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        options: {
          cacheName: "api-network-only",
        },
      },
      {
        urlPattern: ({ sameOrigin, url }) =>
          sameOrigin &&
          (url.pathname.includes("/cheerpx/") ||
            url.pathname.endsWith("/cheerpx")),
        handler: "NetworkOnly",
        method: "GET",
        options: {
          cacheName: "cheerpx-network-only",
        },
      },
      {
        // PostHog ingest proxy must not be intercepted by the service worker.
        urlPattern: ({ sameOrigin, url }) =>
          sameOrigin && url.pathname.startsWith("/ingest/"),
        handler: "NetworkOnly",
        options: {
          cacheName: "posthog-ingest-network-only",
        },
      },
    ],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["macbook.tail9c51fd.ts.net"],
  env: {
    DISABLE_BOT_ID: process.env.DISABLE_BOT_ID ?? "",
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_DEPLOYMENT_ID
      ? (() => {
          // Cheap CRC32 implementation for short string input
          function crc32(str) {
            let crc = ~0
            for (let i = 0; i < str.length; i++) {
              crc ^= str.charCodeAt(i)
              for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
              }
            }
            return (~crc >>> 0).toString(16)
          }
          return crc32(process.env.VERCEL_DEPLOYMENT_ID)
        })()
      : process.env.NEXT_PUBLIC_APP_VERSION || "dev",
  },
  turbopack: {},
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
        pathname: "/avatars/**",
      },
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
        pathname: "/embed/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // unsafe-inline/unsafe-eval are required by Next.js (inline scripts) and Tailwind (style injection).
      // frame-ancestors 'none' duplicates X-Frame-Options for CSP-aware browsers.
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "img-src 'self' cdn.discordapp.com data: blob: *.supabase.co *.r2.cloudflarestorage.com *.eu.r2.cloudflarestorage.com *.github.com raw.githubusercontent.com github.com",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "worker-src 'self' blob:",
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self'",
          "media-src 'self' *.supabase.co *.r2.cloudflarestorage.com *.eu.r2.cloudflarestorage.com *.mux.com blob:",
          "frame-src 'self' blob: *.supabase.co *.r2.cloudflarestorage.com *.eu.r2.cloudflarestorage.com",
          "object-src 'self' blob: *.supabase.co *.r2.cloudflarestorage.com *.eu.r2.cloudflarestorage.com",
          "connect-src 'self' *.r2.cloudflarestorage.com *.eu.r2.cloudflarestorage.com *.supabase.co *.mux.com",
          "frame-ancestors 'none'",
        ].join("; "),
      },
    ]
    // Fallback for environments where middleware doesn't run (e.g. static export).
    // Middleware is the primary mechanism; console-only COEP/COOP for CheerpX.
    const isolationHeaders = [
      { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ]
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/webpc/:sessionId/console", headers: isolationHeaders },
    ]
  },
}

const nextConfigWithPwa = withPWAConfig(nextConfig)
export default process.env.DISABLE_BOT_ID === "true"
  ? nextConfigWithPwa
  : withBotId(nextConfigWithPwa)
