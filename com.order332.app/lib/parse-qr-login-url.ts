/**
 * Extracts `session` and `token` from a desktop QR login URL or raw query string.
 * Used by `/qr-scan` and can be unit-tested without the camera.
 */
export function parseQrLoginUrl(raw: string): { session: string; token: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  try {
    const u = trimmed.includes('://')
      ? new URL(trimmed)
      : new URL(trimmed.startsWith('/') ? `https://x.local${trimmed}` : `https://x.local/${trimmed}`)
    const pathOk = u.pathname === '/auth/qr' || u.pathname.endsWith('/auth/qr')
    if (pathOk) {
      const session = u.searchParams.get('session')
      const token = u.searchParams.get('token')
      if (session && token) return { session, token }
    }
  } catch {
    // fall through
  }

  if (trimmed.startsWith('?')) {
    const q = new URLSearchParams(trimmed.slice(1))
    const session = q.get('session')
    const token = q.get('token')
    if (session && token) return { session, token }
  }

  const loose = trimmed.match(/[?&]session=([^&]+).*?[&]token=([^&]+)/)
  if (loose) {
    try {
      return { session: decodeURIComponent(loose[1]), token: decodeURIComponent(loose[2]) }
    } catch {
      return null
    }
  }

  return null
}
