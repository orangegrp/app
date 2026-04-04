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
} from '@/server/lib/content-upload'
import { supabase } from '@/server/db/supabase/client'
import type { HonoEnv, ContentItem } from '@/server/lib/types'

export const contentItemRoutes = new Hono<HonoEnv>()
contentItemRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.APP_CONTENT))

// GET /content/items — list all content items, optional ?type= filter
contentItemRoutes.get('/', async (c) => {
  const type = c.req.query('type')
  const validTypes = ['image', 'audio', 'pdf', 'download']

  let query = supabase
    .from('content_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (type && validTypes.includes(type)) {
    query = query.eq('item_type', type)
  }

  const { data, error } = await query

  if (error) {
    console.error('[content/items] list error:', error)
    return c.json({ error: 'Failed to fetch items' }, 500)
  }

  const items: ContentItem[] = (data ?? []).map(rowToContentItem)
  return c.json({ items })
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
      const buffer = await file.arrayBuffer()
      const { storageKey, publicUrl } = await uploadContentItemBuffer({
        userId: user.id,
        buffer,
        contentType: file.type,
        filenameHint: file.name,
      })

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
        })
        .select()
        .single()

      if (error || !data) {
        // Best-effort cleanup of orphaned storage object
        await supabase.storage.from('content-library').remove([storageKey]).catch(() => {})
        console.error('[content/items] insert error:', error)
        return c.json({ error: 'Failed to save item' }, 500)
      }

      return c.json({ item: rowToContentItem(data) }, 201)
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
  }
}
