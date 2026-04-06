import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next()
  const path = request.nextUrl.pathname

  // CheerpX requires cross-origin isolation for SharedArrayBuffer on the console
  // document only. The Web PC hub (/webpc) stays a normal app route.
  // CheerpX loads from /cheerpx/; disk images may be same-origin (/webpc-disks/) or
  // R2 presigned URLs — in the latter case the bucket must send CORS + CORP for COEP.
  // ('credentialless' is Chrome/Firefox only.)
  if (/^\/webpc\/[^/]+\/console$/.test(path)) {
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  }

  return response
}

export const config = {
  matcher: ['/webpc/:sessionId/console'],
}
