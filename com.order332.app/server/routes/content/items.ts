import 'server-only'
import { Hono } from 'hono'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { rateLimitByUser } from '@/server/middleware/rate-limit'
import { PERMISSIONS } from '@/lib/permissions'
import {
  inferItemType,
  CONTENT_SIZE_LIMITS,
  VIDEO_MIME_TYPES,
  uploadContentItemBuffer,
  CONTENT_LIBRARY_BUCKET,
} from '@/server/lib/content-upload'
import { signUrl, signUrls } from '@/server/lib/signed-url'
import { requiresVtScan, submitFileToVt } from '@/server/lib/virustotal'
import { supabase } from '@/server/db/supabase/client'
import type { HonoEnv, ContentItem, VtScanStats } from '@/server/lib/types'

export const contentItemRoutes = new Hono<HonoEnv>()
contentItemRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.APP_CONTENT))

// GET /content/items — list content items, optional ?type= and ?folderId= filters
contentItemRoutes.get('/', async (c) => {
  const type = c.req.query('type')
  const folderId = c.req.query('folderId') ?? null
  const validTypes = ['image', 'audio', 'pdf', 'download']

  let query = supabase
    .from('content_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (type && validTypes.includes(type)) {
    query = query.eq('item_type', type)
  }

  // null folderId → root items; non-null → items in that folder
  if (folderId) {
    query = query.eq('folder_id', folderId)
  } else {
    query = query.is('folder_id', null)
  }

  const { data, error } = await query

  if (error) {
    console.error('[content/items] list error:', error)
    return c.json({ error: 'Failed to fetch items' }, 500)
  }

  const items: ContentItem[] = (data ?? []).map(rowToContentItem)

  const signed = await signUrls(CONTENT_LIBRARY_BUCKET, items.map((i) => i.storageKey))
  const result = items.map((i) => ({ ...i, publicUrl: signed.get(i.storageKey) ?? i.publicUrl }))
  return c.json({ items: result })
})

// POST /content/items — upload a new content item
contentItemRoutes.post(
  '/',
  requirePermission(PERMISSIONS.APP_CONTENT_UPLOAD),
  rateLimitByUser(10, 60_000),
  async (c) => {
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return c.json({ error: 'Expected multipart/form-data' }, 400)
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return c.json({ error: 'Missing file field' }, 400)
    }

    const titleRaw = formData.get('title')
    if (typeof titleRaw !== 'string' || !titleRaw.trim()) {
      return c.json({ error: 'Missing title' }, 400)
    }
    const title = titleRaw.trim().slice(0, 200)
    const descriptionRaw = formData.get('description')
    const description = typeof descriptionRaw === 'string' ? descriptionRaw.trim().slice(0, 1000) || null : null

    const folderIdRaw = formData.get('folderId')
    const folderId = typeof folderIdRaw === 'string' && folderIdRaw ? folderIdRaw : null

    // Validate folderId if provided
    if (folderId) {
      const { data: folder, error: folderErr } = await supabase
        .from('content_folders')
        .select('id')
        .eq('id', folderId)
        .single()
      if (folderErr || !folder) {
        return c.json({ error: 'Folder not found' }, 404)
      }
    }

    // Block video uploads explicitly
    if (VIDEO_MIME_TYPES.has(file.type)) {
      return c.json({ error: 'Video uploads are not available yet.' }, 400)
    }

    const itemType = inferItemType(file.type)
    if (!itemType) {
      return c.json({ error: `Unsupported file type: ${file.type}` }, 400)
    }

    const sizeLimit = CONTENT_SIZE_LIMITS[itemType]
    if (file.size > sizeLimit) {
      const mb = Math.round(sizeLimit / 1024 / 1024)
      return c.json({ error: `File exceeds ${mb} MB limit for ${itemType} files` }, 400)
    }

    const user = c.get('user')

    try {
      // Read buffer once — reused for storage upload and optional VT submission
      const buffer = await file.arrayBuffer()

      const { storageKey, publicUrl } = await uploadContentItemBuffer({
        userId: user.id,
        buffer,
        contentType: file.type,
        filenameHint: file.name,
      })

      // Initial VT status: pending (will be updated below if VT is configured)
      const vtEnabled = !!process.env.VIRUSTOTAL_API_KEY && requiresVtScan(file.type)
      const initialVtStatus = vtEnabled ? 'pending' : 'not_required'

      const { data, error } = await supabase
        .from('content_items')
        .insert({
          uploaded_by: user.id,
          item_type: itemType,
          title,
          description,
          storage_key: storageKey,
          public_url: publicUrl,
          mime_type: file.type,
          file_size: file.size,
          folder_id: folderId,
          vt_scan_status: initialVtStatus,
        })
        .select()
        .single()

      if (error || !data) {
        // Best-effort cleanup of orphaned storage object
        await supabase.storage.from('content-library').remove([storageKey]).catch(() => {})
        console.error('[content/items] insert error:', error)
        return c.json({ error: 'Failed to save item' }, 500)
      }

      const item = rowToContentItem(data)

      // Fire-and-forget VT submission: don't block the 201 response
      if (vtEnabled) {
        void submitVtScan(item.id, buffer, file.name)
      }

      const signedPublicUrl = await signUrl(CONTENT_LIBRARY_BUCKET, item.storageKey)
      return c.json({ item: { ...item, publicUrl: signedPublicUrl || item.publicUrl } }, 201)
    } catch (err) {
      console.error('[content/items] upload error:', err)
      return c.json({ error: 'Upload failed' }, 500)
    }
  }
)

// DELETE /content/items/:id — delete a content item (own items only, or superuser)
contentItemRoutes.delete(
  '/:id',
  requirePermission(PERMISSIONS.APP_CONTENT_UPLOAD),
  async (c) => {
    const id = c.req.param('id')
    const user = c.get('user')

    const { data, error } = await supabase
      .from('content_items')
      .select('id, storage_key, uploaded_by')
      .eq('id', id)
      .single()

    if (error || !data) {
      return c.json({ error: 'Item not found' }, 404)
    }

    const isSuperuser = user.permissions === '*'
    if (!isSuperuser && data.uploaded_by !== user.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const { error: storageError } = await supabase.storage
      .from('content-library')
      .remove([data.storage_key])

    if (storageError) {
      console.error('[content/items] storage delete error:', storageError)
      // Continue with DB delete even if storage delete fails
    }

    const { error: deleteError } = await supabase
      .from('content_items')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[content/items] db delete error:', deleteError)
      return c.json({ error: 'Delete failed' }, 500)
    }

    return c.json({ ok: true })
  }
)

// POST /content/items/:id/retry-scan — re-submit a failed VT scan
contentItemRoutes.post(
  '/:id/retry-scan',
  requirePermission(PERMISSIONS.APP_CONTENT),
  rateLimitByUser(5, 60_000),
  async (c) => {
    const id = c.req.param('id')

    const { data, error } = await supabase
      .from('content_items')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return c.json({ error: 'Item not found' }, 404)
    }

    if (!process.env.VIRUSTOTAL_API_KEY) {
      return c.json({ error: 'VirusTotal is not configured' }, 503)
    }

    // Only allow retry on error status
    if (data.vt_scan_status !== 'error') {
      return c.json({ error: 'Item is not in an error state' }, 400)
    }

    // Reset to pending immediately so the UI reflects the change
    const { data: updated, error: updateErr } = await supabase
      .from('content_items')
      .update({ vt_scan_status: 'pending', vt_scan_id: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (updateErr || !updated) {
      return c.json({ error: 'Failed to reset scan status' }, 500)
    }

    // Download file from storage and re-submit to VT (fire-and-forget)
    const filename = (data.storage_key as string).split('/').pop() ?? 'file'
    void (async () => {
      try {
        const { data: fileBlob, error: dlErr } = await supabase.storage
          .from(CONTENT_LIBRARY_BUCKET).download(data.storage_key as string)
        if (dlErr || !fileBlob) throw new Error('Failed to download file for re-scan')
        const buffer = await fileBlob.arrayBuffer()
        await submitVtScan(id, buffer, filename)
      } catch (err) {
        console.error('[content/items] retry-scan fetch error:', err)
        await supabase
          .from('content_items')
          .update({ vt_scan_status: 'error', updated_at: new Date().toISOString() })
          .eq('id', id)
          .then(() => {}, () => {})
      }
    })()

    const signedPublicUrl = await signUrl(CONTENT_LIBRARY_BUCKET, updated.storage_key as string)
    const item = rowToContentItem(updated)
    return c.json({ item: { ...item, publicUrl: signedPublicUrl || item.publicUrl } })
  }
)

/** Submits a file to VT and updates the DB row with the result. Best-effort. */
async function submitVtScan(itemId: string, buffer: ArrayBuffer, filename: string): Promise<void> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY
  if (!apiKey) return
  try {
    const analysisId = await submitFileToVt(buffer, filename, apiKey)
    await supabase
      .from('content_items')
      .update({ vt_scan_id: analysisId, vt_scan_status: 'scanning', updated_at: new Date().toISOString() })
      .eq('id', itemId)
  } catch (err) {
    console.error('[content/items] VT submit error:', err)
    try {
      await supabase
        .from('content_items')
        .update({ vt_scan_status: 'error', updated_at: new Date().toISOString() })
        .eq('id', itemId)
    } catch {
      // Best-effort — ignore
    }
  }
}

function rowToContentItem(row: Record<string, unknown>): ContentItem {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    uploadedBy: row.uploaded_by as string | null,
    itemType: row.item_type as ContentItem['itemType'],
    title: row.title as string,
    description: row.description as string | null,
    storageKey: row.storage_key as string,
    publicUrl: row.public_url as string,
    mimeType: row.mime_type as string,
    fileSize: row.file_size as number,
    durationSec: row.duration_sec as number | null,
    width: row.width as number | null,
    height: row.height as number | null,
    folderId: row.folder_id as string | null,
    vtScanId: row.vt_scan_id as string | null,
    vtScanStatus: (row.vt_scan_status as ContentItem['vtScanStatus']) ?? 'not_required',
    vtScanUrl: row.vt_scan_url as string | null,
    vtScanStats: row.vt_scan_stats as ContentItem['vtScanStats'],
    vtScannedAt: row.vt_scanned_at as string | null,
  }
}
