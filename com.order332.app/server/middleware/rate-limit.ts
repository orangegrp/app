import 'server-only'
import { createMiddleware } from 'hono/factory'
import type { HonoEnv } from '@/server/lib/types'

interface Bucket {
  count: number
  resetAt: number
}

// NOTE: This is an in-memory store — state is per serverless instance and is not
// shared across concurrent Vercel function invocations. It provides meaningful
// protection in development and against single-instance bursts in production.
const buckets = new Map<string, Bucket>()

/**
 * Imperative rate-limit check — use inside route handlers when middleware can't
 * inspect the request body (e.g. action-specific limits).
 * Returns `{ limited: false }` if under the limit, or `{ limited: true, retryAfter }` if over.
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): { limited: false } | { limited: true; retryAfter: number } {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }
  bucket.count++
  if (bucket.count > max) {
    return { limited: true, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  return { limited: false }
}

function getClientIp(req: Request): string {
  // x-real-ip is set by Vercel (and nginx) to the actual client IP — not spoofable by the client
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  // Fallback: Vercel prepends the real client IP as the first entry in x-forwarded-for
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown'

  return 'unknown'
}

/**
 * Creates a per-IP rate-limit middleware.
 * @param max       Maximum requests allowed in the window.
 * @param windowMs  Window duration in milliseconds.
 */
export function rateLimit(max: number, windowMs: number) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const ip = getClientIp(c.req.raw)
    const key = `${c.req.path}:${ip}`
    const now = Date.now()

    let bucket = buckets.get(key)
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }

    bucket.count++

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: 'Too many requests' }, 429)
    }

    return next()
  })
}

/**
 * Creates a per-user rate-limit middleware.
 * Must run after requireAuth (user ID is available in context).
 * @param max       Maximum requests allowed in the window.
 * @param windowMs  Window duration in milliseconds.
 */
export function rateLimitByUser(max: number, windowMs: number) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get('user')
    if (!user) return next()
    const key = `${c.req.path}:user:${user.id}`
    const now = Date.now()

    let bucket = buckets.get(key)
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }

    bucket.count++

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: 'Too many requests' }, 429)
    }

    return next()
  })
}
