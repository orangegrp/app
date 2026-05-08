import "server-only"
import crypto from "crypto"
import { Hono } from "hono"
import { z } from "zod"
import { setCookie } from "hono/cookie"
import { db } from "@/server/db"
import { requireAuth } from "@/server/middleware/auth"
import { rateLimit } from "@/server/middleware/rate-limit"
import { encrypt, decrypt, sha256 } from "@/server/lib/crypto"
import {
  generateTotpSecret,
  generateQrRollingToken,
  verifyQrRollingToken,
  getQrRollingStepRemainingMs,
} from "@/server/lib/totp"
import {
  signAccessToken,
  signRefreshToken,
  getRefreshTokenExpiry,
} from "@/server/lib/jwt"
import { getLocationFromRequest, getClientIp } from "@/server/lib/geoip"
import { QR_SESSION_LIFETIME } from "@/server/lib/constants"
import { isLoginMethodAllowed } from "@/server/lib/login-methods"
import type { HonoEnv, QRLoginSession } from "@/server/lib/types"
import { UAParser } from "ua-parser-js"

export const qrRoutes = new Hono<HonoEnv>()

// OTP helpers — 6-char uppercase alphanumeric, no ambiguous chars (0/O/1/I/L)
const OTP_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function generateOtp(): string {
  const bytes = crypto.randomBytes(6)
  return Array.from(bytes, (b) => OTP_CHARS[b % OTP_CHARS.length]).join("")
}

function formatOtp(otp: string): string {
  return otp.slice(0, 3) + "-" + otp.slice(3)
}

function normalizeOtp(raw: string): string {
  return raw.replace(/-/g, "").toUpperCase().trim()
}

function desktopPayloadFromSession(session: QRLoginSession): {
  desktop: { ip: string; location: string; device: string }
} {
  const desktopIp = session.desktopIp ?? "unknown"
  const locationLabel = session.desktopLocation ?? "Unknown location"
  let deviceLabel = "Unknown device"
  if (session.desktopUserAgent) {
    const parser = new UAParser(session.desktopUserAgent)
    const result = parser.getResult()
    const browserName = result.browser.name ?? "Unknown browser"
    const osName = result.os.name ?? "Unknown OS"
    deviceLabel = `${browserName} on ${osName}`
  }
  return {
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
qrRoutes.post("/init", rateLimit(10, 60_000), async (c) => {
  // Clean up expired QR sessions opportunistically
  db.cleanupExpiredRecords().catch(() => {})

  const desktopIp = getClientIp(c.req.raw)
  const desktopUserAgent = c.req.header("user-agent")
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
// Once scanned or further along, returns status-only (no QR URL needed).
qrRoutes.get("/code", rateLimit(240, 60_000), async (c) => {
  const sessionId = c.req.query("sessionId")
  if (!sessionId) return c.json({ error: "Missing sessionId" }, 400)

  const session = await db.getQRSession(sessionId)
  if (!session) return c.json({ error: "Session not found" }, 404)

  if (session.expiresAt < new Date()) {
    await db.updateQRSessionStatus(sessionId, "expired", {
      resolvedAt: new Date(),
    })
    return c.json({ status: "expired" })
  }

  // For terminal and post-scan statuses, return status only (no QR URL)
  if (
    session.status === "scanned" ||
    session.status === "otp-verified" ||
    session.status === "approved" ||
    session.status === "rejected" ||
    session.status === "expired"
  ) {
    return c.json({ status: session.status })
  }

  const totpSecret = decrypt(session.totpSecretEncrypted)
  const totpToken = generateQrRollingToken(totpSecret)
  const remainingMs = getQrRollingStepRemainingMs()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
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
// Verifies rolling HMAC token, generates OTP, marks session as scanned.
// Returns the OTP only — desktop info is withheld until OTP is verified.
qrRoutes.post("/scan", rateLimit(60, 60_000), requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      sessionId: z.string().uuid(),
      token: z.string().min(1),
    })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400)

  const { sessionId, token } = parsed.data
  const mobileUser = c.get("user")

  const session = await db.getQRSession(sessionId)
  if (!session || session.expiresAt < new Date()) {
    return c.json({ error: "qr_session_invalid" }, 400)
  }

  if (
    session.status === "approved" ||
    session.status === "rejected" ||
    session.status === "expired"
  ) {
    return c.json({ error: "qr_session_invalid" }, 400)
  }

  // Idempotent re-scan: same user already scanned, return stored OTP (no desktop info yet)
  if (session.status === "scanned" || session.status === "otp-verified") {
    if (session.mobileUserId !== mobileUser.id) {
      return c.json({ error: "qr_session_invalid" }, 400)
    }
    return c.json({ sessionId: session.id, otp: formatOtp(session.otp ?? "") })
  }

  if (session.status !== "pending") {
    return c.json({ error: "qr_session_invalid" }, 400)
  }

  const totpSecret = decrypt(session.totpSecretEncrypted)
  if (!verifyQrRollingToken(token, totpSecret)) {
    console.warn("[auth/qr/scan] rolling token verification failed", {
      sessionId,
    })
    return c.json({ error: "qr_token_invalid" }, 400)
  }

  const otp = generateOtp()

  await db.updateQRSessionStatus(sessionId, "scanned", {
    mobileUserId: mobileUser.id,
    otp,
    scannedAt: new Date(),
  })

  return c.json({ sessionId, otp: formatOtp(otp) })
})

// POST /auth/qr/verify-otp
// Desktop submits the OTP shown on the mobile device.
// No auth required — desktop is unauthenticated.
// Transitions session: scanned → otp-verified (safe to reveal desktop info to mobile).
qrRoutes.post("/verify-otp", rateLimit(10, 60_000), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      sessionId: z.string().uuid(),
      otp: z.string().min(1),
    })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400)

  const { sessionId, otp } = parsed.data

  const session = await db.getQRSession(sessionId)
  if (!session || session.expiresAt < new Date() || session.status !== "scanned") {
    return c.json({ error: "qr_session_invalid" }, 400)
  }

  if (normalizeOtp(otp) !== session.otp) {
    return c.json({ error: "otp_invalid" }, 400)
  }

  await db.updateQRSessionStatus(sessionId, "otp-verified")

  return c.json({ ok: true })
})

// GET /auth/qr/mobile-status?sessionId=<id>
// Mobile polls for session status changes after scanning.
// Desktop info is only included once status reaches otp-verified or approved.
qrRoutes.get("/mobile-status", rateLimit(120, 60_000), requireAuth, async (c) => {
  const sessionId = c.req.query("sessionId")
  if (!sessionId) return c.json({ error: "Missing sessionId" }, 400)

  const session = await db.getQRSession(sessionId)
  if (!session || session.mobileUserId !== c.get("user").id) {
    return c.json({ error: "qr_session_invalid" }, 400)
  }

  if (session.expiresAt < new Date()) {
    await db.updateQRSessionStatus(sessionId, "expired", { resolvedAt: new Date() })
    return c.json({ status: "expired" })
  }

  const shouldRevealDesktop =
    session.status === "otp-verified" || session.status === "approved"

  // Set mobileAcknowledged when mobile first sees the otp-verified state.
  // Blocks old/cached clients that never poll this endpoint from being able to approve.
  if (session.status === "otp-verified" && !session.mobileAcknowledged) {
    await db.updateQRSessionStatus(sessionId, "otp-verified", { mobileAcknowledged: true })
  }

  return c.json({
    status: session.status,
    ...(shouldRevealDesktop ? desktopPayloadFromSession(session) : {}),
  })
})

// POST /auth/qr/approve
// Mobile user approves the login request (only allowed after OTP is verified).
qrRoutes.post("/approve", rateLimit(30, 60_000), requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400)

  const { sessionId } = parsed.data
  const mobileUser = c.get("user")

  const session = await db.getQRSession(sessionId)
  if (
    !session ||
    session.status !== "otp-verified" ||
    !session.mobileAcknowledged ||
    session.mobileUserId !== mobileUser.id ||
    session.expiresAt < new Date()
  ) {
    return c.json({ error: "Invalid QR session" }, 400)
  }

  await db.updateQRSessionStatus(sessionId, "approved", {
    resolvedAt: new Date(),
  })

  return c.json({ ok: true })
})

// POST /auth/qr/reject
// Mobile user rejects the login request.
qrRoutes.post("/reject", rateLimit(30, 60_000), requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400)

  const { sessionId } = parsed.data
  const mobileUser = c.get("user")

  const session = await db.getQRSession(sessionId)
  if (
    session &&
    session.mobileUserId === mobileUser.id &&
    (session.status === "scanned" || session.status === "otp-verified")
  ) {
    await db.updateQRSessionStatus(sessionId, "rejected", {
      resolvedAt: new Date(),
    })
  }

  return c.json({ ok: true })
})

// POST /auth/qr/finalize
// Desktop calls this after seeing 'approved' status.
// Issues access token and sets refresh cookie for the desktop session.
qrRoutes.post("/finalize", rateLimit(10, 60_000), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      sessionId: z.string().uuid(),
      isPwa: z.boolean().default(false),
    })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400)

  const { sessionId, isPwa } = parsed.data

  const qrSession = await db.finalizeQRSession(sessionId)
  if (!qrSession || !qrSession.mobileUserId) {
    return c.json({ error: "Invalid QR session" }, 400)
  }

  const user = await db.getUserById(qrSession.mobileUserId)
  if (!user || !user.isActive) return c.json({ error: "Unauthorized" }, 401)

  if (!isLoginMethodAllowed(user, "qr")) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  const expiresAt = getRefreshTokenExpiry(isPwa)

  const session = await db.createSession({
    userId: user.id,
    refreshTokenHash: "",
    isPwa,
    expiresAt,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("user-agent"),
    location: getLocationFromRequest(c.req.raw).displayLabel,
  })

  const accessToken = await signAccessToken(
    user.id,
    session.id,
    user.permissions,
    isPwa
  )
  const refreshToken = await signRefreshToken(user.id, session.id, isPwa)
  await db.rotateSession(session.id, "", sha256(refreshToken), expiresAt)

  setCookie(c, "refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  })

  return c.json({ accessToken })
})
