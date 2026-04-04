import 'server-only'
import { Hono } from 'hono'
import { z } from 'zod'
import { supabase } from '@/server/db/supabase/client'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { PERMISSIONS } from '@/lib/permissions'
import type { HonoEnv } from '@/server/lib/types'

export const adminAiUsageRoutes = new Hono<HonoEnv>()

adminAiUsageRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.ADMIN_PERMISSIONS_MANAGE))

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  days: z.coerce.number().int().min(0).default(30),
  action: z.string().optional(),
  userId: z.string().optional(),
})

adminAiUsageRoutes.get('/', async (c) => {
  const parsed = querySchema.safeParse({
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
    days: c.req.query('days'),
    action: c.req.query('action'),
    userId: c.req.query('userId'),
  })
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400)

  const { page, pageSize, days, action, userId } = parsed.data
  const offset = (page - 1) * pageSize

  // Build time filter
  const since = days > 0
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : null

  // ── Paginated log ─────────────────────────────────────────────────────────
  let logQuery = supabase
    .from('blog_ai_usage')
    .select('id, created_at, user_id, action, input_chars', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (since) logQuery = logQuery.gte('created_at', since)
  if (action) logQuery = logQuery.eq('action', action)
  if (userId) logQuery = logQuery.eq('user_id', userId)

  const { data: logs, count, error: logsErr } = await logQuery
  if (logsErr) return c.json({ error: 'Database error' }, 500)

  // ── Aggregate stats for the same filter (no pagination) ───────────────────
  let statsQuery = supabase
    .from('blog_ai_usage')
    .select('action, input_chars')

  if (since) statsQuery = statsQuery.gte('created_at', since)
  if (action) statsQuery = statsQuery.eq('action', action)
  if (userId) statsQuery = statsQuery.eq('user_id', userId)

  const { data: allRows, error: statsErr } = await statsQuery
  if (statsErr) return c.json({ error: 'Database error' }, 500)

  const byAction: Record<string, number> = {}
  let totalInputChars = 0
  for (const row of allRows ?? []) {
    byAction[row.action] = (byAction[row.action] ?? 0) + 1
    totalInputChars += row.input_chars ?? 0
  }

  // ── Resolve display names for users in this page ──────────────────────────
  const userIds = [...new Set((logs ?? []).map((r) => r.user_id))]
  const userMap: Record<string, { displayName: string | null; discordUsername: string | null }> = {}

  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name, discord_username')
      .in('id', userIds)

    for (const u of users ?? []) {
      userMap[u.id] = { displayName: u.display_name ?? null, discordUsername: u.discord_username ?? null }
    }
  }

  return c.json({
    logs: (logs ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      userId: r.user_id,
      userName: userMap[r.user_id]?.displayName ?? userMap[r.user_id]?.discordUsername ?? r.user_id.slice(0, 8),
      action: r.action,
      inputChars: r.input_chars,
    })),
    total: count ?? 0,
    page,
    pageSize,
    stats: {
      totalCount: allRows?.length ?? 0,
      totalInputChars,
      byAction,
    },
  })
})
