import 'server-only'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '@/server/db'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { randomHex } from '@/server/lib/crypto'
import { parseAndValidatePermissionsInput, PERMISSIONS } from '@/lib/permissions'
import type { HonoEnv } from '@/server/lib/types'

export const adminInviteRoutes = new Hono<HonoEnv>()

adminInviteRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.ADMIN_INVITES_MANAGE))

// GET /admin/invites — list all invite codes
adminInviteRoutes.get('/', async (c) => {
  const invites = await db.listInviteCodes()
  const usedIds = [
    ...new Set(invites.map((i) => i.usedBy).filter((id): id is string => Boolean(id))),
  ]
  const users = await db.getUsersByIds(usedIds)
  const byId = new Map(users.map((u) => [u.id, u]))

  return c.json({
    invites: invites.map((inv) => {
      const redeemer = inv.usedBy ? byId.get(inv.usedBy) : undefined
      return {
        id: inv.id,
        code: inv.code,
        createdAt: inv.createdAt.toISOString(),
        expiresAt: inv.expiresAt?.toISOString() ?? null,
        usedAt: inv.usedAt?.toISOString() ?? null,
        isUsed: inv.isUsed,
        usedBy: inv.usedBy ?? null,
        usedByUser: redeemer
          ? {
              id: redeemer.id,
              displayName: redeemer.displayName ?? null,
              discordUsername: redeemer.discordUsername ?? null,
            }
          : null,
        permissions: inv.permissions,
      }
    }),
  })
})

// POST /admin/invites — create a new invite code
adminInviteRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    expiresInDays: z.number().int().min(1).max(365).optional(),
    permissions: z.array(z.string()).optional(),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  let permissionsCsv = ''
  if (parsed.data.permissions !== undefined) {
    const validated = parseAndValidatePermissionsInput(parsed.data.permissions)
    if (!validated.ok) return c.json({ error: validated.error }, 400)
    permissionsCsv = validated.csv
  }

  const user = c.get('user')
  const code = randomHex(6).toUpperCase()  // 12-char hex invite code
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : undefined

  const invite = await db.createInviteCode({
    code,
    createdBy: user.id,
    expiresAt,
    permissions: permissionsCsv,
  })
  return c.json({ invite }, 201)
})

// DELETE /admin/invites/:id — delete (revoke) an unused invite code
adminInviteRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.deleteInviteCode(id)
  return c.json({ ok: true })
})
