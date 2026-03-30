import 'server-only'
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { db } from '@/server/db'
import { requireAuth } from '@/server/middleware/auth'
import { buildDiscordAuthUrl, exchangeDiscordCode, fetchDiscordUser, getDiscordAvatarUrl } from '@/server/lib/discord'
import {
  signAccessToken,
  signRefreshToken,
  getRefreshTokenExpiry,
  signDiscordLinkToken,
  verifyDiscordLinkToken,
} from '@/server/lib/jwt'
import { hmacSign, sha256, randomBase64url, safeCompare } from '@/server/lib/crypto'
import { canUnlinkDiscord } from '@/server/lib/login-methods'
import type { HonoEnv } from '@/server/lib/types'

export const discordRoutes = new Hono<HonoEnv>()

/** Set on GET /auth/discord when linking Discord; fallback if error callback lacks a parseable `state`. */
const OAUTH_LINK_RETURN_COOKIE = 'oauth_link_return'

/**
 * Decodes and verifies the signed OAuth `state` query param (base64url JSON).
 * Tries raw and `decodeURIComponent` because some stacks alter query encoding.
 */
function parseSignedOAuthState(raw: string | undefined): { payload: string; sig: string } | null {
  if (!raw) return null
  const secret = process.env.BOT_SECRET
  if (!secret) return null
  const trimmed = raw.trim()
  const attempts: string[] = [trimmed]
  try {
    const dec = decodeURIComponent(trimmed)
    if (dec !== trimmed) attempts.push(dec)
  } catch {
    // ignore malformed % sequences
  }
  for (const s of attempts) {
    try {
      const json = Buffer.from(s, 'base64url').toString('utf8')
      const decoded = JSON.parse(json) as { payload: string; sig: string }
      if (
        typeof decoded.payload === 'string' &&
        typeof decoded.sig === 'string' &&
        safeCompare(decoded.sig, hmacSign(secret, decoded.payload))
      ) {
        return decoded
      }
    } catch {
      // try next
    }
  }
  return null
}

/** Signup flow only: un-burn invite when OAuth is cancelled (signed state embeds registrationToken). */
async function releaseInviteIfSignupOAuthAborted(decoded: { payload: string }): Promise<void> {
  const parts = decoded.payload.split('|')
  const registrationToken = parts[1] ?? ''
  const linkUserId = parts[3] ?? ''
  if (linkUserId || !registrationToken) return
  try {
    await db.abortPendingRegistrationAndReleaseInvite(registrationToken)
  } catch (e) {
    console.error('[auth/discord] abort pending registration after OAuth error', e)
  }
}

// POST /auth/discord/link-start — authenticated; returns { url } for full-page OAuth to link Discord
discordRoutes.post('/link-start', requireAuth, async (c) => {
  const user = c.get('user')
  const body = (await c.req.json().catch(() => ({}))) as { isPwa?: boolean; returnTo?: string }
  const isPwa = body.isPwa === true
  const returnTo = body.returnTo === 'home' ? 'home' : 'settings'
  const token = await signDiscordLinkToken(user.id)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const url = `${appUrl}/api/auth/discord?link=${encodeURIComponent(token)}&isPwa=${isPwa ? 'true' : 'false'}&returnTo=${returnTo}`
  return c.json({ url })
})

// POST /auth/discord/unlink — clear Discord from account (requires at least one passkey)
discordRoutes.post('/unlink', requireAuth, async (c) => {
  const authUser = c.get('user')
  const full = await db.getUserById(authUser.id)
  if (!full) return c.json({ error: 'Not found' }, 404)
  if (!full.discordId) return c.json({ error: 'Discord is not connected' }, 400)
  const keys = await db.getPasskeysByUserId(full.id)
  if (!canUnlinkDiscord(keys.length)) {
    return c.json({ error: 'Add a passkey before disconnecting Discord' }, 400)
  }
  await db.updateUser(full.id, {
    discordId: null,
    discordUsername: null,
    discordAvatar: null,
  })
  return c.json({ ok: true })
})

// GET /auth/discord — redirect to Discord OAuth
// Query: registrationToken (signup), link (JWT from link-start), isPwa
discordRoutes.get('/', async (c) => {
  const registrationToken = c.req.query('registrationToken')
  const linkJwt = c.req.query('link')
  const isPwa = c.req.query('isPwa') === 'true'

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  let linkUserId = ''
  if (linkJwt) {
    try {
      linkUserId = await verifyDiscordLinkToken(linkJwt)
    } catch {
      return c.redirect(`${appUrl}/settings?discord=error`)
    }
  }

  const nonce = randomBase64url(16)
  const reg = registrationToken ?? ''
  const returnTo =
    linkUserId && c.req.query('returnTo') === 'home' ? 'home' : 'settings'
  const statePayload = linkUserId
    ? `${nonce}|${reg}|${isPwa ? '1' : '0'}|${linkUserId}|${returnTo}`
    : `${nonce}|${reg}|${isPwa ? '1' : '0'}|${linkUserId}`

  const secret = process.env.BOT_SECRET
  if (!secret) {
    console.error('[auth/discord] BOT_SECRET is not configured')
    return c.json({ error: 'Server configuration error' }, 500)
  }
  const sig = hmacSign(secret, statePayload)
  const state = Buffer.from(JSON.stringify({ payload: statePayload, sig })).toString('base64url')

  setCookie(c, 'oauth_nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 300,
  })

  if (linkUserId) {
    setCookie(c, OAUTH_LINK_RETURN_COOKIE, returnTo === 'home' ? 'home' : 'settings', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 300,
    })
  }

  const url = buildDiscordAuthUrl(state)
  return c.redirect(url)
})

// GET /auth/discord/callback
discordRoutes.get('/callback', async (c) => {
  const code = c.req.query('code')
  const stateParam = c.req.query('state')
  const oauthError = c.req.query('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Discord returns error=access_denied when the user declines — keep link-flow users signed in
  if (oauthError) {
    setCookie(c, 'oauth_nonce', '', { maxAge: 0, path: '/' })

    let deniedPath: string | null = null

    const decoded = parseSignedOAuthState(stateParam)
    if (decoded) {
      await releaseInviteIfSignupOAuthAborted(decoded)
      const parts = decoded.payload.split('|')
      const linkUserId = parts[3] ?? ''
      const linkReturnTo = parts[4] === 'home' ? 'home' : 'settings'
      if (linkUserId) {
        deniedPath = linkReturnTo === 'home' ? '/home' : '/settings'
      }
    }

    if (!deniedPath) {
      const cookieReturn = getCookie(c, OAUTH_LINK_RETURN_COOKIE)
      if (cookieReturn === 'home' || cookieReturn === 'settings') {
        deniedPath = cookieReturn === 'home' ? '/home' : '/settings'
      }
    }

    setCookie(c, OAUTH_LINK_RETURN_COOKIE, '', { maxAge: 0, path: '/' })

    if (deniedPath) {
      return c.redirect(`${appUrl}${deniedPath}?discord=denied`)
    }
    return c.redirect(`${appUrl}/login?error=oauth_denied`)
  }

  if (!code || !stateParam) {
    if (!code && stateParam) {
      const decodedMissingCode = parseSignedOAuthState(stateParam)
      if (decodedMissingCode) await releaseInviteIfSignupOAuthAborted(decodedMissingCode)
    }
    return c.redirect(`${appUrl}/login?error=oauth_denied`)
  }

  const signed = parseSignedOAuthState(stateParam)
  if (!signed) {
    return c.redirect(`${appUrl}/login?error=invalid_state`)
  }
  const statePayload = signed.payload

  const parts = statePayload.split('|')
  const nonce = parts[0] ?? ''
  const registrationToken = parts[1] ?? ''
  const isPwaStr = parts[2] ?? '0'
  const linkUserId = parts[3] ?? ''
  const linkReturnTo = parts[4] === 'home' ? 'home' : 'settings'

  const cookieNonce = getCookie(c, 'oauth_nonce')
  if (!cookieNonce || !safeCompare(cookieNonce, nonce)) {
    return c.redirect(`${appUrl}/login?error=invalid_state`)
  }

  setCookie(c, OAUTH_LINK_RETURN_COOKIE, '', { maxAge: 0, path: '/' })

  const isPwa = isPwaStr === '1'

  try {
    const discordAccessToken = await exchangeDiscordCode(code)
    const discordUser = await fetchDiscordUser(discordAccessToken)

    if (linkUserId) {
      const linkReturnPath = linkReturnTo === 'home' ? '/home' : '/settings'

      const owner = await db.getUserById(linkUserId)
      if (!owner) {
        setCookie(c, 'oauth_nonce', '', { maxAge: 0, path: '/' })
        return c.redirect(`${appUrl}${linkReturnPath}?discord=error`)
      }

      const existingByDiscord = await db.getUserByDiscordId(discordUser.id)
      if (existingByDiscord && existingByDiscord.id !== linkUserId) {
        setCookie(c, 'oauth_nonce', '', { maxAge: 0, path: '/' })
        return c.redirect(`${appUrl}${linkReturnPath}?discord=taken`)
      }

      if (owner.discordId && owner.discordId !== discordUser.id) {
        setCookie(c, 'oauth_nonce', '', { maxAge: 0, path: '/' })
        return c.redirect(`${appUrl}${linkReturnPath}?discord=already_linked`)
      }

      await db.updateUser(linkUserId, {
        discordId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatar: getDiscordAvatarUrl(discordUser.id, discordUser.avatar),
      })

      setCookie(c, 'oauth_nonce', '', { maxAge: 0, path: '/' })
      return c.redirect(`${appUrl}${linkReturnPath}?discord=linked`)
    }

    let user = await db.getUserByDiscordId(discordUser.id)

    if (!user) {
      if (!registrationToken) {
        return c.redirect(`${appUrl}/login?error=invite_required`)
      }

      const pending = await db.getPendingRegistration(registrationToken)
      if (!pending || pending.expiresAt < new Date()) {
        return c.redirect(`${appUrl}/login?error=expired_registration`)
      }

      const inviteForReg = await db.getInviteCodeById(pending.inviteCodeId)
      if (!inviteForReg) {
        return c.redirect(`${appUrl}/login?error=expired_registration`)
      }

      user = await db.createUser({
        discordId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatar: getDiscordAvatarUrl(discordUser.id, discordUser.avatar),
        permissions: inviteForReg.permissions,
      })

      await db.setInviteCodeUsedByUser(pending.inviteCodeId, user.id)

      await db.deletePendingRegistration(pending.id)
    } else {
      await db.updateUser(user.id, {
        discordUsername: discordUser.username,
        discordAvatar: getDiscordAvatarUrl(discordUser.id, discordUser.avatar),
      })
      user = (await db.getUserById(user.id)) ?? user
    }

    if (!user.isActive) {
      return c.redirect(`${appUrl}/login?error=account_disabled`)
    }

    if (!user.loginDiscordEnabled) {
      return c.redirect(`${appUrl}/login?error=method_disabled`)
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      path: '/',
      maxAge: isPwa ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60,
    })

    setCookie(c, 'oauth_nonce', '', { maxAge: 0, path: '/' })

    return c.redirect(`${appUrl}/auth/callback#token=${encodeURIComponent(accessToken)}`)
  } catch {
    return c.redirect(`${appUrl}/login?error=auth_failed`)
  }
})
