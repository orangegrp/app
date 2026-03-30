import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { TOKEN_LIFETIMES } from './constants'
import type { JWTPayload } from './types'

function getSecret(env: string): Uint8Array {
  const val = process.env[env]
  if (!val || val.length < 32) {
    throw new Error(`Environment variable ${env} must be set and at least 32 characters long`)
  }
  return new TextEncoder().encode(val)
}

export function getAccessSecret(): Uint8Array {
  return getSecret('JWT_SECRET')
}

export function getRefreshSecret(): Uint8Array {
  return getSecret('JWT_REFRESH_SECRET')
}

export function getDiscordLinkSecret(): Uint8Array {
  return getSecret('DISCORD_LINK_SECRET')
}

// Validate secrets on module load in production
if (process.env.NODE_ENV === 'production') {
  getAccessSecret()
  getRefreshSecret()
  getDiscordLinkSecret()
}

export async function signAccessToken(
  userId: string,
  sessionId: string,
  permissions: string,
  isPwa: boolean
): Promise<string> {
  const lifetime = isPwa ? TOKEN_LIFETIMES.pwa.access : TOKEN_LIFETIMES.browser.access
  return new SignJWT({ sessionId, permissions, isPwa })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${lifetime}s`)
    .sign(getAccessSecret())
}

export async function signRefreshToken(
  userId: string,
  sessionId: string,
  isPwa: boolean
): Promise<string> {
  const lifetime = isPwa ? TOKEN_LIFETIMES.pwa.refresh : TOKEN_LIFETIMES.browser.refresh
  return new SignJWT({ sessionId, isPwa })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${lifetime}s`)
    .sign(getRefreshSecret())
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getAccessSecret())
  return {
    sub: payload.sub as string,
    sessionId: payload.sessionId as string,
    permissions: payload.permissions as string,
    isPwa: payload.isPwa as boolean,
    iat: payload.iat as number,
    exp: payload.exp as number,
  }
}

export async function verifyRefreshToken(
  token: string
): Promise<{ sub: string; sessionId: string; isPwa: boolean; exp: number }> {
  const { payload } = await jwtVerify(token, getRefreshSecret())
  return {
    sub: payload.sub as string,
    sessionId: payload.sessionId as string,
    isPwa: payload.isPwa as boolean,
    exp: payload.exp as number,
  }
}

export function getRefreshTokenExpiry(isPwa: boolean): Date {
  const lifetime = isPwa ? TOKEN_LIFETIMES.pwa.refresh : TOKEN_LIFETIMES.browser.refresh
  return new Date(Date.now() + lifetime * 1000)
}

const DISCORD_LINK_PURPOSE = 'discord_link'

/** Short-lived token for OAuth “link Discord account” from settings. Uses a dedicated secret. */
export async function signDiscordLinkToken(userId: string): Promise<string> {
  return new SignJWT({ purpose: DISCORD_LINK_PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(getDiscordLinkSecret())
}

export async function verifyDiscordLinkToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, getDiscordLinkSecret())
  if (payload.purpose !== DISCORD_LINK_PURPOSE) {
    throw new Error('Invalid link token')
  }
  const sub = payload.sub
  if (!sub || typeof sub !== 'string') throw new Error('Invalid link token')
  return sub
}
