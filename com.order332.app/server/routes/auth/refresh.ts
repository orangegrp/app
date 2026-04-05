import 'server-only'
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { db } from '@/server/db'
import { signAccessToken, signRefreshToken, verifyRefreshToken, getRefreshTokenExpiry } from '@/server/lib/jwt'
import { sha256 } from '@/server/lib/crypto'
import { rateLimit } from '@/server/middleware/rate-limit'
import type { HonoEnv } from '@/server/lib/types'

export const refreshRoutes = new Hono<HonoEnv>()

// POST /auth/refresh
// Issues a new access token using the refresh cookie. Rotates the refresh token.
refreshRoutes.post('/refresh', rateLimit(30, 60_000), async (c) => {
  const refreshToken = getCookie(c, 'refresh_token')
  if (!refreshToken) return c.json({ error: 'Unauthorized' }, 401)

  let payload
  try {
    payload = await verifyRefreshToken(refreshToken)
  } catch {
    deleteCookie(c, 'refresh_token', { path: '/' })
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const isPwa = payload.isPwa

  const tokenHash = sha256(refreshToken)
  const session = await db.getSessionByTokenHash(tokenHash)

  if (!session || session.expiresAt < new Date() || session.userId !== payload.sub) {
    deleteCookie(c, 'refresh_token', { path: '/' })
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const user = await db.getUserById(session.userId)
  if (!user || !user.isActive) {
    await db.deleteSession(session.id)
    deleteCookie(c, 'refresh_token', { path: '/' })
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Rotate: new refresh token, new expiry
  const newExpiresAt = getRefreshTokenExpiry(isPwa)
  const newRefreshToken = await signRefreshToken(user.id, session.id, isPwa)
  const rotated = await db.rotateSession(session.id, tokenHash, sha256(newRefreshToken), newExpiresAt)
  if (!rotated) {
    deleteCookie(c, 'refresh_token', { path: '/' })
    return c.json({ error: 'Unauthorized' }, 401)
  }

  setCookie(c, 'refresh_token', newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  const accessToken = await signAccessToken(user.id, session.id, user.permissions, isPwa)
  return c.json({ accessToken })
})

// POST /auth/logout
refreshRoutes.post('/logout', async (c) => {
  const refreshToken = getCookie(c, 'refresh_token')
  if (refreshToken) {
    const tokenHash = sha256(refreshToken)
    const session = await db.getSessionByTokenHash(tokenHash)
    if (session) await db.deleteSession(session.id)
  }

  deleteCookie(c, 'refresh_token', {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'Strict',
  })

  return c.json({ ok: true })
})
