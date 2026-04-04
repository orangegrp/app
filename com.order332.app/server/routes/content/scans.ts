import 'server-only'
import { Hono } from 'hono'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { rateLimitByUser } from '@/server/middleware/rate-limit'
import { PERMISSIONS } from '@/lib/permissions'
import { supabase } from '@/server/db/supabase/client'
import { getVtAnalysis, submitFileToVt } from '@/server/lib/virustotal'
import { CONTENT_LIBRARY_BUCKET } from '@/server/lib/content-upload'
import type { HonoEnv, VtScanStats } from '@/server/lib/types'

export const contentScanRoutes = new Hono<HonoEnv>()
contentScanRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.APP_CONTENT))

/**
 * POST /content/scans/check
 * Checks all pending/scanning items against VirusTotal and updates their status.
 * Called by the client every 30s when scanning items are visible.
 */
contentScanRoutes.post(
  '/check',
  rateLimitByUser(1, 10_000), // 1 request per 10s per user
  async (c) => {
    const apiKey = process.env.VIRUSTOTAL_API_KEY
    if (!apiKey) {
      return c.json({ updated: 0, stillPending: 0 })
    }

    const { data, error } = await supabase
      .from('content_items')
      .select('id, vt_scan_id, vt_scan_status, storage_key, mime_type')
      .in('vt_scan_status', ['pending', 'scanning'])
      .limit(20)

    if (error) {
      console.error('[content/scans] fetch error:', error)
      return c.json({ error: 'Failed to fetch pending scans' }, 500)
    }

    const rows = data ?? []
    let updated = 0
    let stillPending = 0

    await Promise.allSettled(
      rows.map(async (row) => {
        try {
          if (row.vt_scan_status === 'pending' || !row.vt_scan_id) {
            // Re-try initial submission by downloading directly from private storage
            const { data: fileBlob, error: dlErr } = await supabase.storage
              .from(CONTENT_LIBRARY_BUCKET).download(row.storage_key as string)
            if (dlErr || !fileBlob) {
              stillPending++
              return
            }
            const buffer = await fileBlob.arrayBuffer()
            const filename = (row.storage_key as string).split('/').pop() ?? 'file'
            const analysisId = await submitFileToVt(buffer, filename, apiKey)
            await supabase
              .from('content_items')
              .update({ vt_scan_id: analysisId, vt_scan_status: 'scanning', updated_at: new Date().toISOString() })
              .eq('id', row.id as string)
            stillPending++
            return
          }

          const result = await getVtAnalysis(row.vt_scan_id as string, apiKey)
          if (!result) {
            stillPending++
            return
          }

          const stats = result.stats as VtScanStats
          const isFlagged = stats.malicious > 0 || stats.suspicious > 0
          await supabase
            .from('content_items')
            .update({
              vt_scan_status: isFlagged ? 'flagged' : 'clean',
              vt_scan_url: result.vtUrl,
              vt_scan_stats: stats,
              vt_scanned_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id as string)
          updated++
        } catch (err) {
          console.error('[content/scans] poll error for item', row.id, err)
          stillPending++
        }
      })
    )

    return c.json({ updated, stillPending })
  }
)
