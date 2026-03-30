import 'server-only'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { db } from '@/server/db'
import { signAccessToken, signRefreshToken, getRefreshTokenExpiry } from '@/server/lib/jwt'
import { sha256 } from '@/server/lib/crypto'
import { MINI_APP_PERMISSIONS, PERMISSIONS } from '@/lib/permissions'
import type { HonoEnv } from '@/server/lib/types'

/** Dev admin: all mini-apps + admin tools (local testing). */
const DEV_ADMIN_PERMISSIONS = [
  ...MINI_APP_PERMISSIONS,
  PERMISSIONS.ADMIN_INVITES_MANAGE,
  PERMISSIONS.ADMIN_SYSTEM_CLEANUP,
  PERMISSIONS.ADMIN_PERMISSIONS_MANAGE,
].join(',')

/** Dev member: all mini-apps, no admin (deny-by-default is tested with real accounts). */
const DEV_MEMBER_PERMISSIONS = MINI_APP_PERMISSIONS.join(',')

export const devLoginRoutes = new Hono<HonoEnv>()

devLoginRoutes.post('/dev-login', async (c) => {
  if (process.env.NODE_ENV !== 'development' || process.env.DEV_LOGIN_ENABLED !== 'true') {
    return c.json({ error: 'Not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({})) as { role?: string; isPwa?: boolean }
  const role = body.role === 'admin' ? 'admin' : 'member'
  const isPwa = body.isPwa === true
  const permissions = role === 'admin' ? DEV_ADMIN_PERMISSIONS : DEV_MEMBER_PERMISSIONS

  const discordId = `dev-${role}`
  let user = await db.getUserByDiscordId(discordId)
  if (!user) {
    user = await db.createUser({ discordId, discordUsername: `dev_${role}`, permissions })
  }

  const expiresAt = getRefreshTokenExpiry(isPwa)
  const session = await db.createSession({
    userId: user.id,
    refreshTokenHash: '',
    isPwa,
    expiresAt,
    ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: c.req.header('user-agent'),
  })
  const accessToken = await signAccessToken(user.id, session.id, user.permissions, isPwa)
  const refreshToken = await signRefreshToken(user.id, session.id, isPwa)
  await db.rotateSession(session.id, sha256(refreshToken), expiresAt)

  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })

  return c.json({ accessToken })
})
