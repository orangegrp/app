import 'server-only'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '@/server/db'
import type { UpdateUserData } from '@/server/db/interface'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { normalizeDisplayName } from '@/lib/display-name'
import {
  assertCannotDemoteOtherAdmin,
  isAdminish,
  isSuperuserPermissionsCsv,
  parseAndValidatePermissionsInput,
  PERMISSIONS,
} from '@/lib/permissions'
import type { HonoEnv } from '@/server/lib/types'

export const adminUserRoutes = new Hono<HonoEnv>()

adminUserRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.ADMIN_PERMISSIONS_MANAGE))

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
})

adminUserRoutes.get('/', async (c) => {
  const parsed = listQuerySchema.safeParse({
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
    search: c.req.query('search'),
  })
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400)

  const { page, pageSize, search } = parsed.data
  const offset = (page - 1) * pageSize
  const { users, total } = await db.listUsersForAdmin({ limit: pageSize, offset, search })
  return c.json({
    users: users.map((u) => ({
      id: u.id,
      displayName: u.displayName ?? null,
      discordUsername: u.discordUsername ?? null,
      discordAvatar: u.discordAvatar ?? null,
      permissions: u.permissions,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  })
})

const patchBodySchema = z
  .object({
    permissions: z.array(z.string()).optional(),
    displayName: z.union([z.string(), z.null()]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.permissions !== undefined ||
      d.displayName !== undefined ||
      d.isActive !== undefined,
    { message: 'Invalid request' },
  )

function isOnlyAdminishUser(
  targetId: string,
  rows: { id: string; permissions: string }[],
): boolean {
  const adminIds = rows.filter((r) => isAdminish(r.permissions)).map((r) => r.id)
  return adminIds.length === 1 && adminIds[0] === targetId
}

adminUserRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = patchBodySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  const existing = await db.getUserById(id)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const caller = c.get('user')
  const updatePayload: UpdateUserData = {}

  if (parsed.data.permissions !== undefined) {
    if (id === caller.id) {
      return c.json({ error: 'You cannot change your own permissions here' }, 403)
    }
    if (
      isSuperuserPermissionsCsv(existing.permissions) &&
      !isSuperuserPermissionsCsv(caller.permissions)
    ) {
      return c.json({ error: "Only a superuser may change another superuser's permissions" }, 403)
    }
    const validated = parseAndValidatePermissionsInput(parsed.data.permissions)
    if (!validated.ok) return c.json({ error: validated.error }, 400)
    const demote = assertCannotDemoteOtherAdmin(id, caller.id, existing.permissions, validated.csv)
    if (!demote.ok) return c.json({ error: demote.error }, 403)
    updatePayload.permissions = validated.csv
  }

  if (parsed.data.displayName !== undefined) {
    updatePayload.displayName = normalizeDisplayName(parsed.data.displayName)
  }

  if (parsed.data.isActive !== undefined) {
    if (parsed.data.isActive === false && id === caller.id) {
      return c.json({ error: 'You cannot disable login for your own account' }, 403)
    }
    if (parsed.data.isActive === false && isAdminish(existing.permissions)) {
      const rows = await db.listUserIdAndPermissions()
      if (isOnlyAdminishUser(id, rows)) {
        return c.json({ error: 'Cannot disable login for the last admin account' }, 403)
      }
    }
    updatePayload.isActive = parsed.data.isActive
  }

  const updated = await db.updateUser(id, updatePayload)
  if (parsed.data.isActive === false) {
    await db.deleteUserSessions(id)
  }
  return c.json({
    user: {
      id: updated.id,
      displayName: updated.displayName ?? null,
      discordUsername: updated.discordUsername ?? null,
      discordAvatar: updated.discordAvatar ?? null,
      permissions: updated.permissions,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    },
  })
})

adminUserRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const caller = c.get('user')
  if (id === caller.id) {
    return c.json({ error: 'Use account settings to delete your own account' }, 403)
  }

  const existing = await db.getUserById(id)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  if (isAdminish(existing.permissions)) {
    const rows = await db.listUserIdAndPermissions()
    if (isOnlyAdminishUser(id, rows)) {
      return c.json({ error: 'Cannot delete the last admin account' }, 403)
    }
  }

  await db.deleteUser(id)
  return c.json({ ok: true })
})
