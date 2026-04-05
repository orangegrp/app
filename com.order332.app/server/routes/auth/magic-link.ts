import 'server-only'
import { Hono } from 'hono'
import { z } from 'zod'
import { setCookie } from 'hono/cookie'
import { db } from '@/server/db'
import { signAccessToken, signRefreshToken, getRefreshTokenExpiry } from '@/server/lib/jwt'
import { sha256, randomBase64url, safeCompare } from '@/server/lib/crypto'
import { isLoginMethodAllowed } from '@/server/lib/login-methods'
import { rateLimit } from '@/server/middleware/rate-limit'
import { MAGIC_LINK_RATE_LIMIT } from '@/server/lib/constants'
import type { HonoEnv } from '@/server/lib/types'

export const magicLinkRoutes = new Hono<HonoEnv>()

function getMagicSecret(): string {
  const secret = process.env.BOT_SECRET
  if (!secret) throw new Error('Missing BOT_SECRET environment variable')
  return secret
}

// POST /auth/magic/generate
// Bot-only endpoint. Generates a single-use magic link for a Discord user.
magicLinkRoutes.post('/generate', rateLimit(MAGIC_LINK_RATE_LIMIT.max, MAGIC_LINK_RATE_LIMIT.windowMs), async (c) => {
  const authHeader = c.req.header('Authorization')
  let botSecret: string
  try {
    botSecret = getMagicSecret()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!authHeader?.startsWith('Bearer ') || !safeCompare(authHeader.slice(7), botSecret)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      discordId: z.string().min(1),
      expiresIn: z.string().optional().default('10m'),
    })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const { discordId, expiresIn } = parsed.data

  // Parse expiresIn (e.g. "10m", "5m")
  const minutesMatch = expiresIn.match(/^(\d+)m$/)
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 10
  const lifetimeMs = Math.min(minutes, 30) * 60 * 1000  // cap at 30 minutes

  // Generate raw token and HMAC it
  const rawToken = randomBase64url(32)
  const tokenHash = sha256(rawToken)
  const expiresAt = new Date(Date.now() + lifetimeMs)

  // Check if user exists
  const user = await db.getUserByDiscordId(discordId)

  await db.createMagicToken({
    tokenHash,
    discordId,
    userId: user?.id,
    expiresAt,
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const url = `${appUrl}/auth/magic#token=${encodeURIComponent(rawToken)}`

  return c.json({ url })
})

// POST /auth/magic/verify
// Verifies and consumes a magic link token, issues session tokens.
magicLinkRoutes.post('/verify', rateLimit(10, 60_000), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      token: z.string().min(1),
      isPwa: z.boolean().default(false),
    })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: 'Unauthorized' }, 401)

  const { token, isPwa } = parsed.data
  const tokenHash = sha256(token)

  const magicToken = await db.consumeMagicToken(tokenHash)
  if (!magicToken) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Get or find user by Discord ID
  let user = magicToken.userId ? await db.getUserById(magicToken.userId) : null
  if (!user) {
    user = await db.getUserByDiscordId(magicToken.discordId)
  }

  if (!user || !user.isActive) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!isLoginMethodAllowed(user, 'magic')) {
    return c.json({ error: 'Unauthorized' }, 401)
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
  await db.rotateSession(session.id, '', sha256(refreshToken), expiresAt)

  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  return c.json({ accessToken })
})
