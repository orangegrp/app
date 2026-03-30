import 'server-only'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '@/server/db'
import { requireAuth } from '@/server/middleware/auth'
import { deleteCookie } from 'hono/cookie'
import type { HonoEnv } from '@/server/lib/types'

export const accountRoutes = new Hono<HonoEnv>()

const deleteAccountSchema = z.object({
  accountId: z.string().min(1),
  confirmation: z.literal('delete my account'),
})

// DELETE /auth/account
// Deletes the authenticated user's account. Requires typing account ID + confirmation phrase.
accountRoutes.delete('/', requireAuth, async (c) => {
  const user = c.get('user')

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request' }, 400)
  }

  const parsed = deleteAccountSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { accountId } = parsed.data

  if (accountId !== user.id) {
    return c.json({ error: 'Account ID does not match' }, 400)
  }

  // Delete user — cascade deletes sessions, passkeys, magic tokens
  await db.deleteUser(user.id)

  // Clear refresh cookie
  deleteCookie(c, 'refresh_token', {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })

  return c.json({ ok: true })
})
