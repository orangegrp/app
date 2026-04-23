import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next()
  const path = request.nextUrl.pathname

  // CheerpX requires cross-origin isolation for SharedArrayBuffer on the console
  // document only. The Web PC hub (/webpc) stays a normal app route.
  // CheerpX loads from /cheerpx/; disk images may be same-origin (/webpc-disks/) or
  // R2 presigned URLs — in the latter case the bucket must send CORS + CORP for COEP.
  // ('credentialless' is Chrome/Firefox only.)
  if (/^\/webpc\/[^/]+\/console$/.test(path)) {
    response.headers.set("Cross-Origin-Embedder-Policy", "require-corp")
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin")
  }

  if (/^\/share\/[^/]+\/embed(?:\/.*)?$/.test(path)) {
    response.headers.set("Access-Control-Allow-Origin", "*")
    response.headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
    response.headers.set("Cross-Origin-Resource-Policy", "cross-origin")
    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "img-src 'self' data: blob: *.supabase.co *.r2.cloudflarestorage.com *.eu.r2.cloudflarestorage.com",
        "media-src 'self' *.supabase.co *.r2.cloudflarestorage.com *.eu.r2.cloudflarestorage.com *.mux.com blob:",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "connect-src 'self' *.r2.cloudflarestorage.com *.eu.r2.cloudflarestorage.com *.supabase.co *.mux.com",
        "frame-src 'self' blob: *.supabase.co *.r2.cloudflarestorage.com *.eu.r2.cloudflarestorage.com",
        "object-src 'none'",
        "frame-ancestors *",
      ].join("; ")
    )
  }

  return response
}

export const config = {
  matcher: [
    "/webpc/:sessionId/console",
    "/share/:token/embed",
    "/share/:token/embed/:path*",
  ],
}
