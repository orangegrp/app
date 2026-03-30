import 'server-only'

export interface GeoLocation {
  country?: string
  city?: string
  displayLabel: string
}

// In production (Vercel), geolocation data comes from Vercel's edge headers.
// In dev/localhost, no location data is available — return a placeholder.
export function getLocationFromRequest(request: Request): GeoLocation {
  if (process.env.NODE_ENV !== 'production') {
    return { displayLabel: 'Local network' }
  }

  // Dynamic import at call time to avoid bundling issues in non-Vercel environments
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { geolocation } = require('@vercel/functions') as typeof import('@vercel/functions')
  const geo = geolocation(request)

  const parts = [geo.city, geo.country].filter(Boolean)
  return {
    country: geo.country ?? undefined,
    city: geo.city ?? undefined,
    displayLabel: parts.length > 0 ? parts.join(', ') : 'Unknown location',
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown'
  return 'unknown'
}
