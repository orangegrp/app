import 'server-only'
import { checkBotId } from 'botid/server'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '@/server/db'
import { mergeLoginMethodFlags } from '@/server/lib/login-methods'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { inviteRoutes } from '@/server/routes/auth/invite'
import { passkeyRoutes } from '@/server/routes/auth/passkey'
import { discordRoutes } from '@/server/routes/auth/discord'
import { magicLinkRoutes } from '@/server/routes/auth/magic-link'
import { qrRoutes } from '@/server/routes/auth/qr'
import { refreshRoutes } from '@/server/routes/auth/refresh'
import { accountRoutes } from '@/server/routes/auth/account'
import { devLoginRoutes } from '@/server/routes/auth/dev-login'
import { adminInviteRoutes } from '@/server/routes/admin/invites'
import { adminUserRoutes } from '@/server/routes/admin/users'
import { adminAiUsageRoutes } from '@/server/routes/admin/ai-usage'
import { blogPostRoutes } from '@/server/routes/blog/posts'
import { blogImageRoutes } from '@/server/routes/blog/images'
import { blogAiAssistRoutes } from '@/server/routes/blog/ai-assist'
import { webpcDiskUrlRoutes } from '@/server/routes/webpc/disk-url'
import { contentItemRoutes } from '@/server/routes/content/items'
import { contentFolderRoutes } from '@/server/routes/content/folders'
import { contentScanRoutes } from '@/server/routes/content/scans'
import { musicTrackRoutes } from '@/server/routes/music/tracks'
import { normalizeDisplayName } from '@/lib/display-name'
import { isWelcomeWizardCompletedForUser } from '@/lib/welcome-wizard'
import { PERMISSIONS } from '@/lib/permissions'
import { safeCompare } from '@/server/lib/crypto'
import type { HonoEnv } from '@/server/lib/types'

export const app = new Hono<HonoEnv>().basePath('/api')

function isBotIdDisabled(): boolean {
  return process.env.DISABLE_BOT_ID === 'true'
}

/** Routes that cannot send BotID headers (OAuth redirects, server-to-server, cron, probes). */
function isBotIdAllowlisted(method: string, pathname: string): boolean {
  const m = method.toUpperCase()
  if (m === 'GET' && pathname === '/api/health') return true
  if (m === 'GET' && pathname === '/api/version') return true
  if (m === 'GET' && pathname === '/api/auth/discord') return true
  if (m === 'GET' && pathname === '/api/auth/discord/callback') return true
  if (m === 'POST' && pathname === '/api/auth/magic/generate') return true
  if (m === 'GET' && pathname === '/api/cron/cleanup') return true
  return false
}

// Schema validation on cold start (non-blocking)
let schemaValidated = false
app.use('*', async (_c, next) => {
  if (!schemaValidated) {
    schemaValidated = true
    db.validateAndMigrateSchema().catch((err: unknown) => {
      console.error('[DB] Schema validation failed:', err)
    })
  }
  return next()
})

app.use('*', async (c, next) => {
  let pathname: string
  try {
    pathname = new URL(c.req.url).pathname
  } catch {
    pathname = ''
  }
  if (isBotIdAllowlisted(c.req.method, pathname)) {
    return next()
  }
  if (isBotIdDisabled()) {
    return next()
  }
  const verification = await checkBotId()
  if (verification.isBot) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  return next()
})

// ── Health / Version ──────────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ ok: true }))
app.get('/version', (c) => c.json({ version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev' }))

/** Proxies Instatus summary (ISR 60s) for the in-app status banner. */
app.get('/status/summary', async (c) => {
  try {
    const res = await fetch('https://332.instatus.com/summary.json', {
      next: { revalidate: 60 },
    })
    if (!res.ok) return c.json({ error: 'upstream' }, 502)
    const data: unknown = await res.json()
    return c.json(data)
  } catch {
    return c.json({ error: 'fetch_failed' }, 502)
  }
})

// GET /webpc/disk-url — presigned R2 GET for VM disk images (requires app.webpc)
app.route('/webpc', webpcDiskUrlRoutes)

// ── Auth routes ───────────────────────────────────────────────────────────────

const auth = new Hono<HonoEnv>()

// Invite code claim
// POST /auth/invite/claim
auth.route('/invite', inviteRoutes)

// Passkey routes (mounted directly; passkeyRoutes defines its own sub-paths):
//   POST /auth/register/start    — begin passkey registration (requires registrationToken)
//   POST /auth/register/finish   — complete registration, create user, issue tokens
//   POST /auth/challenge          — generate WebAuthn authentication options
//   POST /auth/verify             — verify passkey login, issue tokens
//   POST /auth/add/start          — add passkey to existing account (requires auth)
//   POST /auth/add/finish         — complete adding passkey (requires auth)
auth.route('/', passkeyRoutes)

// Discord OAuth
// GET /auth/discord               — redirect to Discord authorise URL
// GET /auth/discord/callback      — exchange code, issue tokens, redirect
auth.route('/discord', discordRoutes)

// Magic links (bot-issued)
// POST /auth/magic/generate       — bot calls this (requires BOT_SECRET)
// POST /auth/magic/verify         — user verifies token, issues tokens
auth.route('/magic', magicLinkRoutes)

// QR code login
// POST /auth/qr/init              — desktop creates session
// GET  /auth/qr/code              — desktop polls for rotating qrUrl + status
// POST /auth/qr/scan              — mobile scans (requires auth)
// POST /auth/qr/approve|reject   — mobile approves or rejects
// POST /auth/qr/finalize        — desktop completes login after approval
auth.route('/qr', qrRoutes)

// Token refresh + logout
// POST /auth/refresh              — rotate refresh token, issue new access token
// POST /auth/logout               — invalidate session, clear cookie
auth.route('/', refreshRoutes)

// Account management
// /auth/account/*
auth.route('/account', accountRoutes)

// Dev login bypass (development only — returns 404 in production)
// POST /auth/dev-login
auth.route('/', devLoginRoutes)

app.route('/auth', auth)

// ── Protected routes ──────────────────────────────────────────────────────────

app.get('/me', requireAuth, async (c) => {
  const authUser = c.get('user')
  if (process.env.NODE_ENV === 'development' && authUser.id === 'dev-user-id') {
    return c.json({
      id: authUser.id,
      permissions: authUser.permissions,
      isPwa: authUser.isPwa,
      discordUsername: 'dev',
      discordAvatar: undefined,
      discordId: undefined,
      displayName: null,
      loginPasskeyEnabled: true,
      loginDiscordEnabled: true,
      loginMagicEnabled: true,
      loginQrEnabled: true,
      passkeyCount: 1,
      welcomeWizardCompleted: true,
    })
  }
  const user = await db.getUserById(authUser.id)
  if (!user) return c.json({ error: 'Not found' }, 404)
  if (!user.isActive) return c.json({ error: 'Forbidden' }, 403)
  const passkeys = await db.getPasskeysByUserId(user.id)
  return c.json({
    id: user.id,
    permissions: user.permissions,
    isPwa: authUser.isPwa,
    discordId: user.discordId ?? null,
    discordUsername: user.discordUsername,
    discordAvatar: user.discordAvatar,
    displayName: user.displayName ?? null,
    loginPasskeyEnabled: user.loginPasskeyEnabled,
    loginDiscordEnabled: user.loginDiscordEnabled,
    loginMagicEnabled: user.loginMagicEnabled,
    loginQrEnabled: user.loginQrEnabled,
    passkeyCount: passkeys.length,
    welcomeWizardCompleted: isWelcomeWizardCompletedForUser(user),
  })
})

const loginMethodsBodySchema = z.object({
  loginPasskeyEnabled: z.boolean().optional(),
  loginDiscordEnabled: z.boolean().optional(),
  loginMagicEnabled: z.boolean().optional(),
  loginQrEnabled: z.boolean().optional(),
})

app.patch('/me/login-methods', requireAuth, async (c) => {
  const authUser = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = loginMethodsBodySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const user = await db.getUserById(authUser.id)
  if (!user) return c.json({ error: 'Not found' }, 404)

  try {
    const merged = mergeLoginMethodFlags(user, parsed.data)
    await db.updateUser(user.id, merged)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid request'
    return c.json({ error: msg }, 400)
  }

  const updated = await db.getUserById(authUser.id)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  const passkeys = await db.getPasskeysByUserId(updated.id)
  return c.json({
    id: updated.id,
    permissions: updated.permissions,
    isPwa: authUser.isPwa,
    discordId: updated.discordId ?? null,
    discordUsername: updated.discordUsername,
    discordAvatar: updated.discordAvatar,
    displayName: updated.displayName ?? null,
    loginPasskeyEnabled: updated.loginPasskeyEnabled,
    loginDiscordEnabled: updated.loginDiscordEnabled,
    loginMagicEnabled: updated.loginMagicEnabled,
    loginQrEnabled: updated.loginQrEnabled,
    passkeyCount: passkeys.length,
    welcomeWizardCompleted: isWelcomeWizardCompletedForUser(updated),
  })
})

const meProfileBodySchema = z.object({
  displayName: z.union([z.string(), z.null()]),
})

app.patch('/me/profile', requireAuth, async (c) => {
  const authUser = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = meProfileBodySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const user = await db.getUserById(authUser.id)
  if (!user) return c.json({ error: 'Not found' }, 404)

  const displayName = normalizeDisplayName(parsed.data.displayName)
  await db.updateUser(user.id, { displayName })

  const updated = await db.getUserById(authUser.id)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  const passkeys = await db.getPasskeysByUserId(updated.id)
  return c.json({
    id: updated.id,
    permissions: updated.permissions,
    isPwa: authUser.isPwa,
    discordId: updated.discordId ?? null,
    discordUsername: updated.discordUsername,
    discordAvatar: updated.discordAvatar,
    displayName: updated.displayName ?? null,
    loginPasskeyEnabled: updated.loginPasskeyEnabled,
    loginDiscordEnabled: updated.loginDiscordEnabled,
    loginMagicEnabled: updated.loginMagicEnabled,
    loginQrEnabled: updated.loginQrEnabled,
    passkeyCount: passkeys.length,
    welcomeWizardCompleted: isWelcomeWizardCompletedForUser(updated),
  })
})

app.post('/me/welcome-wizard/complete', requireAuth, async (c) => {
  const authUser = c.get('user')
  const user = await db.getUserById(authUser.id)
  if (!user) return c.json({ error: 'Not found' }, 404)
  if (!user.isActive) return c.json({ error: 'Forbidden' }, 403)

  const now = new Date()
  await db.updateUser(user.id, { welcomeWizardCompletedAt: now })

  const updated = await db.getUserById(authUser.id)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  const passkeys = await db.getPasskeysByUserId(updated.id)
  return c.json({
    welcomeWizardCompleted: isWelcomeWizardCompletedForUser(updated),
    id: updated.id,
    permissions: updated.permissions,
    isPwa: authUser.isPwa,
    discordId: updated.discordId ?? null,
    discordUsername: updated.discordUsername,
    discordAvatar: updated.discordAvatar,
    displayName: updated.displayName ?? null,
    loginPasskeyEnabled: updated.loginPasskeyEnabled,
    loginDiscordEnabled: updated.loginDiscordEnabled,
    loginMagicEnabled: updated.loginMagicEnabled,
    loginQrEnabled: updated.loginQrEnabled,
    passkeyCount: passkeys.length,
  })
})

// ── Admin routes ──────────────────────────────────────────────────────────────

// GET  /admin/invites     — list all invite codes
// POST /admin/invites     — create invite code
// DELETE /admin/invites/:id — revoke invite code
app.route('/admin/invites', adminInviteRoutes)

// GET   /admin/users       — list users (requires admin.permissions.manage)
// PATCH /admin/users/:id   — profile / permissions / freeze / delete (same gate)
app.route('/admin/users', adminUserRoutes)

// GET /admin/ai-usage      — AI usage log + stats (requires admin.permissions.manage)
app.route('/admin/ai-usage', adminAiUsageRoutes)

// ── Content Library routes ────────────────────────────────────────────────────

// GET    /content/items         — list content items (requires app.content)
// POST   /content/items         — upload item (requires app.content + app.content.upload)
// DELETE /content/items/:id     — delete item (requires app.content + app.content.upload)
app.route('/content/items', contentItemRoutes)

// GET    /content/folders        — list all folders flat (requires app.content)
// POST   /content/folders        — create folder (requires app.content.upload)
// PATCH  /content/folders/:id    — rename folder (requires app.content.upload)
// DELETE /content/folders/:id    — delete folder (requires app.content.upload)
app.route('/content/folders', contentFolderRoutes)

// POST   /content/scans/check    — poll VT for pending/scanning items (requires app.content)
app.route('/content/scans', contentScanRoutes)

// ── Music routes ──────────────────────────────────────────────────────────────

// GET    /music/tracks           — list tracks (requires app.music)
// POST   /music/tracks           — upload track (requires app.music + app.music.upload)
// DELETE /music/tracks/:id       — delete track (requires app.music + app.music.upload)
// GET    /music/tracks/:id/lyrics — get lyrics content (requires app.music)
app.route('/music/tracks', musicTrackRoutes)

// ── Blog routes ───────────────────────────────────────────────────────────────

// GET    /blog/posts         — list all posts (requires app.blog)
// GET    /blog/posts/*       — fetch single post by path
// POST   /blog/posts         — create new post
// PUT    /blog/posts/*       — update/publish/unpublish post
// DELETE /blog/posts/*       — hard-delete post (superuser only)
app.route('/blog/posts', blogPostRoutes)

// POST /blog/images          — upload image to Supabase Storage (requires app.blog)
app.route('/blog/images', blogImageRoutes)

// POST /blog/ai-assist       — AI-assisted editing (requires app.blog + app.blog.ai)
app.route('/blog/ai-assist', blogAiAssistRoutes)

// GET /cron/cleanup — Vercel Cron (Authorization: Bearer CRON_SECRET); runs db cleanup on a schedule
app.get('/cron/cleanup', async (c) => {
  const secret = process.env.CRON_SECRET
  if (process.env.NODE_ENV === 'production' && !secret) {
    return c.json({ error: 'misconfigured' }, 500)
  }
  if (!secret) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ') || !safeCompare(authHeader.slice(7), secret)) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await db.cleanupExpiredRecords()
  return c.json({ ok: true })
})

app.post('/auth/cleanup', requireAuth, requirePermission(PERMISSIONS.ADMIN_SYSTEM_CLEANUP), async (c) => {
  await db.cleanupExpiredRecords()
  return c.json({ ok: true })
})

export type AppType = typeof app
