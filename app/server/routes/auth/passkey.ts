import 'server-only'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '@/server/db'
import { requireAuth } from '@/server/middleware/auth'
import {
  createRegistrationOptions,
  verifyRegistration,
  createAuthenticationOptions,
  verifyAuthentication,
} from '@/server/lib/passkey'
import { signAccessToken, signRefreshToken, getRefreshTokenExpiry } from '@/server/lib/jwt'
import { sha256 } from '@/server/lib/crypto'
import { WEBAUTHN_CHALLENGE_LIFETIME } from '@/server/lib/constants'
import { setCookie } from 'hono/cookie'
import { isLoginMethodAllowed } from '@/server/lib/login-methods'
import type { HonoEnv } from '@/server/lib/types'

export const passkeyRoutes = new Hono<HonoEnv>()

// ── Registration (requires pending registration token from invite code claim) ──

// POST /auth/register/passkey/start
// Begins passkey registration ceremony. Requires registration_token from invite claim.
passkeyRoutes.post('/register/start', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({ registrationToken: z.string().min(1) }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const { registrationToken } = parsed.data
  const pending = await db.getPendingRegistration(registrationToken)
  if (!pending || pending.expiresAt < new Date()) {
    return c.json({ error: 'Invalid or expired registration session' }, 400)
  }

  // Use pending registration ID as temporary userId for the ceremony
  // Actual user won't exist yet — created in /finish
  const tempUserId = `pending:${pending.id}`
  const { options, challenge } = await createRegistrationOptions({
    userId: tempUserId,
    userName: 'member',
    existingCredentialIds: [],
  })

  const expiresAt = new Date(Date.now() + WEBAUTHN_CHALLENGE_LIFETIME * 1000)
  await db.createChallenge({
    challenge,
    type: 'registration',
    expiresAt,
  })

  return c.json({ options, registrationToken })
})

// POST /auth/register/passkey/finish
// Completes passkey registration, creates user, issues tokens.
passkeyRoutes.post('/register/finish', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      registrationToken: z.string().min(1),
      credential: z.record(z.string(), z.unknown()),
      isPwa: z.boolean().default(false),
      credentialName: z.string().max(64).optional(),
    })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const { registrationToken, credential, isPwa, credentialName } = parsed.data

  const pending = await db.getPendingRegistration(registrationToken)
  if (!pending || pending.expiresAt < new Date()) {
    return c.json({ error: 'Invalid or expired registration session' }, 400)
  }

  // Find challenge (most recent registration challenge)
  const challengeStr = (credential as { response?: { clientDataJSON?: string } }).response
    ?.clientDataJSON
  if (!challengeStr) return c.json({ error: 'Invalid credential' }, 400)

  // Decode clientDataJSON to extract challenge
  let expectedChallenge: string
  try {
    const clientData = JSON.parse(Buffer.from(challengeStr, 'base64url').toString())
    expectedChallenge = clientData.challenge as string
  } catch {
    return c.json({ error: 'Invalid credential' }, 400)
  }

  const challengeRecord = await db.getChallengeByValue(expectedChallenge)
  if (!challengeRecord || challengeRecord.expiresAt < new Date() || challengeRecord.type !== 'registration') {
    return c.json({ error: 'Invalid or expired challenge' }, 400)
  }

  let verification
  try {
    verification = await verifyRegistration({
      response: credential as unknown as Parameters<typeof verifyRegistration>[0]['response'],
      expectedChallenge,
    })
  } catch {
    await db.deleteChallenge(challengeRecord.id)
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await db.deleteChallenge(challengeRecord.id)

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { credential: cred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

  const inviteForReg = await db.getInviteCodeById(pending.inviteCodeId)
  if (!inviteForReg) {
    return c.json({ error: 'Invalid or expired registration session' }, 400)
  }

  const user = await db.createUser({ permissions: inviteForReg.permissions })

  await db.setInviteCodeUsedByUser(pending.inviteCodeId, user.id)

  // Save passkey credential
  await db.createPasskeyCredential({
    userId: user.id,
    credentialId: cred.id,
    publicKey: Buffer.from(cred.publicKey).toString('base64url'),
    counter: cred.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: JSON.stringify(cred.transports ?? []),
    name: credentialName,
  })

  // Delete pending registration
  await db.deletePendingRegistration(pending.id)

  // Issue tokens
  const expiresAt = getRefreshTokenExpiry(isPwa)
  const session = await db.createSession({
    userId: user.id,
    refreshTokenHash: '',  // placeholder, rotated immediately below
    isPwa,
    expiresAt,
    ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: c.req.header('user-agent'),
  })

  const accessToken = await signAccessToken(user.id, session.id, user.permissions, isPwa)
  const finalRefreshToken = await signRefreshToken(user.id, session.id, isPwa)
  await db.rotateSession(session.id, sha256(finalRefreshToken), expiresAt)

  setCookie(c, 'refresh_token', finalRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
    maxAge: isPwa ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60,
  })

  return c.json({ accessToken })
})

// ── Authentication (login with existing passkey) ──────────────────────────────

// POST /auth/challenge
// Generates WebAuthn authentication options.
passkeyRoutes.post('/challenge', async (c) => {
  const { options, challenge } = await createAuthenticationOptions()

  const expiresAt = new Date(Date.now() + WEBAUTHN_CHALLENGE_LIFETIME * 1000)
  await db.createChallenge({ challenge, type: 'authentication', expiresAt })

  return c.json({ options })
})

// POST /auth/verify
// Verifies WebAuthn authentication response, issues tokens.
passkeyRoutes.post('/verify', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      credential: z.record(z.string(), z.unknown()),
      isPwa: z.boolean().default(false),
    })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const { credential, isPwa } = parsed.data

  // Extract credential ID and challenge from the response
  const credentialId = (credential as { id?: string }).id
  if (!credentialId) return c.json({ error: 'Unauthorized' }, 401)

  const clientDataJSON = (
    credential as { response?: { clientDataJSON?: string } }
  ).response?.clientDataJSON
  if (!clientDataJSON) return c.json({ error: 'Unauthorized' }, 401)

  let expectedChallenge: string
  try {
    const clientData = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString())
    expectedChallenge = clientData.challenge as string
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const challengeRecord = await db.getChallengeByValue(expectedChallenge)
  if (!challengeRecord || challengeRecord.expiresAt < new Date() || challengeRecord.type !== 'authentication') {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const passkey = await db.getPasskeyByCredentialId(credentialId)
  if (!passkey) {
    await db.deleteChallenge(challengeRecord.id)
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let verification
  try {
    verification = await verifyAuthentication({
      response: credential as unknown as Parameters<typeof verifyAuthentication>[0]['response'],
      expectedChallenge,
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports,
      },
    })
  } catch {
    await db.deleteChallenge(challengeRecord.id)
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await db.deleteChallenge(challengeRecord.id)

  if (!verification.verified) return c.json({ error: 'Unauthorized' }, 401)

  await db.updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter)

  const user = await db.getUserById(passkey.userId)
  if (!user || !user.isActive) return c.json({ error: 'Unauthorized' }, 401)

  if (!isLoginMethodAllowed(user, 'passkey')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const expiresAt = getRefreshTokenExpiry(isPwa)
  const session = await db.createSession({
    userId: user.id,
    refreshTokenHash: '',  // placeholder
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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
    maxAge: isPwa ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60,
  })

  return c.json({ accessToken })
})

// POST /auth/passkey/add/start — add a passkey to an existing authenticated account
passkeyRoutes.post('/add/start', requireAuth, async (c) => {
  const user = c.get('user')
  const existingKeys = await db.getPasskeysByUserId(user.id)

  const { options, challenge } = await createRegistrationOptions({
    userId: user.id,
    userName: user.id,
    existingCredentialIds: existingKeys.map((k) => k.credentialId),
  })

  const expiresAt = new Date(Date.now() + WEBAUTHN_CHALLENGE_LIFETIME * 1000)
  await db.createChallenge({ challenge, userId: user.id, type: 'registration', expiresAt })

  return c.json({ options })
})

// POST /auth/passkey/add/finish — complete adding a passkey to an existing account
passkeyRoutes.post('/add/finish', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({ credential: z.record(z.string(), z.unknown()), credentialName: z.string().max(64).optional() })
    .safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const { credential, credentialName } = parsed.data
  const user = c.get('user')

  const clientDataJSON = (credential as { response?: { clientDataJSON?: string } }).response?.clientDataJSON
  if (!clientDataJSON) return c.json({ error: 'Invalid credential' }, 400)

  let expectedChallenge: string
  try {
    const clientData = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString())
    expectedChallenge = clientData.challenge as string
  } catch {
    return c.json({ error: 'Invalid credential' }, 400)
  }

  const challengeRecord = await db.getChallengeByValue(expectedChallenge)
  if (!challengeRecord || challengeRecord.userId !== user.id || challengeRecord.expiresAt < new Date()) {
    return c.json({ error: 'Invalid or expired challenge' }, 400)
  }

  let verification
  try {
    verification = await verifyRegistration({
      response: credential as unknown as Parameters<typeof verifyRegistration>[0]['response'],
      expectedChallenge,
    })
  } catch {
    await db.deleteChallenge(challengeRecord.id)
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await db.deleteChallenge(challengeRecord.id)
  if (!verification.verified || !verification.registrationInfo) return c.json({ error: 'Unauthorized' }, 401)

  const { credential: cred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  await db.createPasskeyCredential({
    userId: user.id,
    credentialId: cred.id,
    publicKey: Buffer.from(cred.publicKey).toString('base64url'),
    counter: cred.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: JSON.stringify(cred.transports ?? []),
    name: credentialName,
  })

  return c.json({ ok: true })
})

// GET /auth/passkeys — list passkeys for the authenticated user (no secrets)
passkeyRoutes.get('/passkeys', requireAuth, async (c) => {
  const user = c.get('user')
  const rows = await db.getPasskeysByUserId(user.id)
  return c.json({
    passkeys: rows.map((p) => ({
      id: p.id,
      name: p.name ?? null,
      createdAt: p.createdAt.toISOString(),
      lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
      deviceType: p.deviceType,
      backedUp: p.backedUp,
    })),
  })
})

// DELETE /auth/passkeys/:id — remove a passkey owned by the current user
passkeyRoutes.delete('/passkeys/:id', requireAuth, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const keys = await db.getPasskeysByUserId(user.id)
  if (!keys.some((k) => k.id === id)) {
    return c.json({ error: 'Not found' }, 404)
  }
  await db.deletePasskeyCredential(id)
  return c.json({ ok: true })
})
