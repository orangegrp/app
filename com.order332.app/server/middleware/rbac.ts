import 'server-only'
import { createMiddleware } from 'hono/factory'
import { hasAnyPermission, hasPermission } from '@/server/lib/constants'
import type { HonoEnv } from '@/server/lib/types'

export function requirePermission(permission: string) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    if (!hasPermission(user.permissions, permission)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    return next()
  })
}

export function requireAnyPermission(permissions: string[]) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    if (!hasAnyPermission(user.permissions, permissions)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    return next()
  })
}
