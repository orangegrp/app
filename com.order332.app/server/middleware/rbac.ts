import 'server-only'
import { createMiddleware } from 'hono/factory'
import { hasPermission, hasAnyPermission } from '@/lib/permissions'
import { db } from '@/server/db'
import type { HonoEnv } from '@/server/lib/types'

export function requirePermission(permission: string) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    // For admin permissions, re-verify against DB to prevent stale JWT grants
    if (permission.startsWith('admin.') || permission === '*') {
      const fresh = await db.getUserById(user.id)
      if (!fresh || !hasPermission(fresh.permissions, permission)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    } else {
      if (!hasPermission(user.permissions, permission)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }
    return next()
  })
}

export function requireAnyPermission(permissions: string[]) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    const hasAdminPerm = permissions.some(p => p.startsWith('admin.') || p === '*')
    if (hasAdminPerm) {
      const fresh = await db.getUserById(user.id)
      if (!fresh || !hasAnyPermission(fresh.permissions, permissions)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    } else {
      if (!hasAnyPermission(user.permissions, permissions)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    }
    return next()
  })
}
