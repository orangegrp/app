import 'server-only'
import { Hono } from 'hono'
import { z } from 'zod'
import { PERMISSIONS } from '@/lib/permissions'
import { WEBPC_MACHINE_IDS, type MachineId } from '@/lib/webpc-disks'
import { presignWebpcDiskRead } from '@/server/lib/webpc-r2'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import type { HonoEnv } from '@/server/lib/types'

const machineIdEnum = WEBPC_MACHINE_IDS as unknown as [string, ...string[]]

const querySchema = z.object({
  machineId: z.enum(machineIdEnum),
  sessionId: z.string().max(128).optional(),
})

export const webpcDiskUrlRoutes = new Hono<HonoEnv>().get(
  '/disk-url',
  requireAuth,
  requirePermission(PERMISSIONS.APP_WEBPC),
  async (c) => {
    const parsed = querySchema.safeParse({
      machineId: c.req.query('machineId'),
      sessionId: c.req.query('sessionId') ?? undefined,
    })
    if (!parsed.success) {
      return c.json({ error: 'Invalid request' }, 400)
    }

    const { machineId, sessionId } = parsed.data
    const user = c.get('user')
    if (sessionId) {
      console.info('[webpc] disk-url', { sessionId, machineId, userId: user?.id })
    }

    try {
      const result = await presignWebpcDiskRead(machineId as MachineId)
      return c.json(result)
    } catch {
      return c.json({ error: 'Service unavailable' }, 503)
    }
  },
)
