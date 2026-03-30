import 'server-only'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '@/server/db'
import { randomBase64url } from '@/server/lib/crypto'
import { PENDING_REGISTRATION_LIFETIME } from '@/server/lib/constants'
import type { HonoEnv } from '@/server/lib/types'

export const inviteRoutes = new Hono<HonoEnv>()

const claimSchema = z.object({ code: z.string().min(1).max(64) })

// POST /auth/invite/claim
// Claims an invite code, burns it immediately, returns a short-lived registration_token
inviteRoutes.post('/claim', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request' }, 400)
  }

  const parsed = claimSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const code = parsed.data.code.trim().toUpperCase()

  const invite = await db.getInviteCode(code)

  // Always return the same error to prevent enumeration
  if (!invite || invite.isUsed || (invite.expiresAt && invite.expiresAt < new Date())) {
    return c.json({ error: 'Invalid or expired invite code' }, 400)
  }

  // Generate a short-lived registration token
  const registrationToken = randomBase64url(32)
  const expiresAt = new Date(Date.now() + PENDING_REGISTRATION_LIFETIME * 1000)

  // Pending registration links the invite to this session; then burn the code
  await db.createPendingRegistration({
    inviteCodeId: invite.id,
    registrationToken,
    expiresAt,
  })

  // used_by is only for real user ids; pending links via pending_registrations.invite_code_id
  await db.markInviteCodeUsed(invite.id)

  return c.json({ registrationToken, expiresAt: expiresAt.toISOString() })
})
