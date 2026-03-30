import 'server-only'
import { createMiddleware } from 'hono/factory'
import { verifyAccessToken } from '@/server/lib/jwt'
import { db } from '@/server/db'
import type { HonoEnv } from '@/server/lib/types'

// Dev bypass: in development, accept Authorization: Bearer dev-token
// Returns a mock admin user for localhost testing
const DEV_TOKEN = 'dev-token'
const DEV_USER = { id: 'dev-user-id', permissions: '*', isPwa: false }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const requireAuth = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)

  if (process.env.NODE_ENV === 'development' && process.env.DEV_LOGIN_ENABLED === 'true' && token === DEV_TOKEN) {
    c.set('user', DEV_USER)
    return next()
  }

  try {
    const payload = await verifyAccessToken(token)

    // Reject tokens with non-UUID subject (e.g. forged tokens with arbitrary strings)
    if (!UUID_RE.test(payload.sub) || !UUID_RE.test(payload.sessionId)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    // Bind access token to its session — prevents forged tokens from working
    // even if JWT_SECRET is known, because the sessionId must exist in the DB.
    const session = await db.getSessionById(payload.sessionId)
    if (!session || session.userId !== payload.sub || session.expiresAt < new Date()) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    c.set('user', { id: payload.sub, permissions: payload.permissions, isPwa: payload.isPwa })
    return next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
})
