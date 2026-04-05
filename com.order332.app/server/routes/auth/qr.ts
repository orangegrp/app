import 'server-only'
import { Hono } from 'hono'
import { z } from 'zod'
import { setCookie } from 'hono/cookie'
import { db } from '@/server/db'
import { requireAuth } from '@/server/middleware/auth'
import { rateLimit } from '@/server/middleware/rate-limit'
import { encrypt, decrypt, sha256 } from '@/server/lib/crypto'
import { generateTotpSecret, generateQrRollingToken, verifyQrRollingToken, getQrRollingStepRemainingMs } from '@/server/lib/totp'
import { signAccessToken, signRefreshToken, getRefreshTokenExpiry } from '@/server/lib/jwt'
import { getLocationFromRequest, getClientIp } from '@/server/lib/geoip'
import { QR_SESSION_LIFETIME } from '@/server/lib/constants'
import { isLoginMethodAllowed } from '@/server/lib/login-methods'
import type { HonoEnv, QRLoginSession } from '@/server/lib/types'
import { UAParser } from 'ua-parser-js'

export const qrRoutes = new Hono<HonoEnv>()

function desktopPayloadFromSession(session: QRLoginSession): {
  sessionId: string
  desktop: { ip: string; location: string; device: string }
} {
  const desktopIp = session.desktopIp ?? 'unknown'
  const locationLabel = session.desktopLocation ?? 'Unknown location'
  let deviceLabel = 'Unknown device'
  if (session.desktopUserAgent) {
    const parser = new UAParser(session.desktopUserAgent)
    const result = parser.getResult()
    const browserName = result.browser.name ?? 'Unknown browser'
    const osName = result.os.name ?? 'Unknown OS'
    deviceLabel = `${browserName} on ${osName}`
  }
  return {
    sessionId: session.id,
    desktop: {
      ip: desktopIp,
      location: locationLabel,
      device: deviceLabel,
    },
  }
}

// POST /auth/qr/init
// Desktop initiates a QR login session. Returns sessionId.
// Opportunistically cleans up old expired sessions.
qrRoutes.post('/init', rateLimit(10, 60_000), async (c) => {
  // Clean up expired QR sessions opportunistically
  db.cleanupExpiredRecords().catch(() => {})

  const desktopIp = getClientIp(c.req.raw)
  const desktopUserAgent = c.req.header('user-agent')
  const desktopLocation = getLocationFromRequest(c.req.raw).displayLabel

  const totpSecret = generateTotpSecret()
  const totpSecretEncrypted = encrypt(totpSecret)

  const expiresAt = new Date(Date.now() + QR_SESSION_LIFETIME * 1000)

  const session = await db.createQRSession({
    totpSecretEncrypted,
    desktopIp,
    desktopUserAgent,
    desktopLocation,
    expiresAt,
  })

  return c.json({ sessionId: session.id, expiresAt: expiresAt.toISOString() })
})

// GET /auth/qr/code?sessionId=<id>
// Desktop polls for status; QR URL token rotates every 1s (HMAC-SHA256).
qrRoutes.get('/code', async (c) => {
  const sessionId = c.req.query('sessionId')
  if (!sessionId) return c.json({ error: 'Missing sessionId' }, 400)

  const session = await db.getQRSession(sessionId)
  if (!session) return c.json({ error: 'Session not found' }, 404)

  if (session.expiresAt < new Date()) {
    await db.updateQRSessionStatus(sessionId, 'expired', { resolvedAt: new Date() })
    return c.json({ status: 'expired' })
  }

  // For terminal statuses, return status only
  if (session.status === 'approved' || session.status === 'rejected' || session.status === 'expired') {
    return c.json({ status: session.status })
  }

  const totpSecret = decrypt(session.totpSecretEncrypted)
  const totpToken = generateQrRollingToken(totpSecret)
  const remainingMs = getQrRollingStepRemainingMs()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const qrUrl = `${appUrl}/auth/qr?session=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(totpToken)}`

  return c.json({
    qrUrl,
    remainingMs,
    expiresAt: session.expiresAt.toISOString(),
    status: session.status,
  })
})

// POST /auth/qr/scan
// Mobile user (must be logged in) scans the QR code.
// Verifies rolling HMAC token, marks session as scanned, returns desktop location/device info.
qrRoutes.post('/scan', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      sessionId: z.string().uuid(),
      token: z.string().min(1),
    })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const { sessionId, token } = parsed.data
  const mobileUser = c.get('user')

  const session = await db.getQRSession(sessionId)
  if (!session || session.expiresAt < new Date()) {
    return c.json({ error: 'qr_session_invalid' }, 400)
  }

  if (
    session.status === 'approved' ||
    session.status === 'rejected' ||
    session.status === 'expired'
  ) {
    return c.json({ error: 'qr_session_invalid' }, 400)
  }

  if (session.status === 'scanned') {
    if (session.mobileUserId !== mobileUser.id) {
      return c.json({ error: 'qr_session_invalid' }, 400)
    }
    return c.json(desktopPayloadFromSession(session))
  }

  if (session.status !== 'pending') {
    return c.json({ error: 'qr_session_invalid' }, 400)
  }

  const totpSecret = decrypt(session.totpSecretEncrypted)
  if (!verifyQrRollingToken(token, totpSecret)) {
    console.warn('[auth/qr/scan] rolling token verification failed', { sessionId })
    return c.json({ error: 'qr_token_invalid' }, 400)
  }

  await db.updateQRSessionStatus(sessionId, 'scanned', {
    mobileUserId: mobileUser.id,
    scannedAt: new Date(),
  })

  const updated = await db.getQRSession(sessionId)
  if (!updated) {
    return c.json({ error: 'qr_session_invalid' }, 400)
  }
  return c.json(desktopPayloadFromSession(updated))
})

// POST /auth/qr/approve
// Mobile user approves the login request.
qrRoutes.post('/approve', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const { sessionId } = parsed.data
  const mobileUser = c.get('user')

  const session = await db.getQRSession(sessionId)
  if (
    !session ||
    session.status !== 'scanned' ||
    session.mobileUserId !== mobileUser.id ||
    session.expiresAt < new Date()
  ) {
    return c.json({ error: 'Invalid QR session' }, 400)
  }

  await db.updateQRSessionStatus(sessionId, 'approved', { resolvedAt: new Date() })

  return c.json({ ok: true })
})

// POST /auth/qr/reject
// Mobile user rejects the login request.
qrRoutes.post('/reject', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const { sessionId } = parsed.data
  const mobileUser = c.get('user')

  const session = await db.getQRSession(sessionId)
  if (session && session.mobileUserId === mobileUser.id) {
    await db.updateQRSessionStatus(sessionId, 'rejected', { resolvedAt: new Date() })
  }

  return c.json({ ok: true })
})

// POST /auth/qr/finalize
// Desktop calls this after seeing 'approved' status.
// Issues access token and sets refresh cookie for the desktop session.
qrRoutes.post('/finalize', rateLimit(10, 60_000), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      sessionId: z.string().uuid(),
      isPwa: z.boolean().default(false),
    })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const { sessionId, isPwa } = parsed.data

  const qrSession = await db.finalizeQRSession(sessionId)
  if (!qrSession || !qrSession.mobileUserId) {
    return c.json({ error: 'Invalid QR session' }, 400)
  }

  const user = await db.getUserById(qrSession.mobileUserId)
  if (!user || !user.isActive) return c.json({ error: 'Unauthorized' }, 401)

  if (!isLoginMethodAllowed(user, 'qr')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const expiresAt = getRefreshTokenExpiry(isPwa)

  const session = await db.createSession({
    userId: user.id,
    refreshTokenHash: '',
    isPwa,
    expiresAt,
    ipAddress: getClientIp(c.req.raw),
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
