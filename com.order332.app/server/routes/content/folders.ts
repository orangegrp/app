import 'server-only'
import { Hono } from 'hono'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { PERMISSIONS } from '@/lib/permissions'
import { supabase } from '@/server/db/supabase/client'
import type { HonoEnv, ContentFolder } from '@/server/lib/types'

export const contentFolderRoutes = new Hono<HonoEnv>()
contentFolderRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.APP_CONTENT))

// GET /content/folders — returns all folders flat (client builds tree)
contentFolderRoutes.get('/', async (c) => {
  const { data, error } = await supabase
    .from('content_folders')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    console.error('[content/folders] list error:', error)
    return c.json({ error: 'Failed to fetch folders' }, 500)
  }

  const folders: ContentFolder[] = (data ?? []).map(rowToContentFolder)
  return c.json({ folders })
})

// POST /content/folders — create a new folder
contentFolderRoutes.post(
  '/',
  requirePermission(PERMISSIONS.APP_CONTENT_UPLOAD),
  async (c) => {
    let body: { name?: unknown; parentId?: unknown }
    try {
      body = await c.req.json() as typeof body
    } catch {
      return c.json({ error: 'Expected JSON body' }, 400)
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
    if (!name) {
      return c.json({ error: 'Missing folder name' }, 400)
    }

    const parentId = typeof body.parentId === 'string' ? body.parentId : null

    // Validate parentId exists if provided
    if (parentId) {
      const { data: parent, error: parentErr } = await supabase
        .from('content_folders')
        .select('id')
        .eq('id', parentId)
        .single()

      if (parentErr || !parent) {
        return c.json({ error: 'Parent folder not found' }, 404)
      }
    }

    const user = c.get('user')
    const { data, error } = await supabase
      .from('content_folders')
      .insert({ name, parent_id: parentId, created_by: user.id })
      .select()
      .single()

    if (error || !data) {
      console.error('[content/folders] insert error:', error)
      return c.json({ error: 'Failed to create folder' }, 500)
    }

    return c.json({ folder: rowToContentFolder(data) }, 201)
  }
)

// PATCH /content/folders/:id — rename a folder
contentFolderRoutes.patch(
  '/:id',
  requirePermission(PERMISSIONS.APP_CONTENT_UPLOAD),
  async (c) => {
    const id = c.req.param('id')
    const user = c.get('user')

    let body: { name?: unknown }
    try {
      body = await c.req.json() as typeof body
    } catch {
      return c.json({ error: 'Expected JSON body' }, 400)
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
    if (!name) {
      return c.json({ error: 'Missing folder name' }, 400)
    }

    // Check ownership
    const { data: existing, error: fetchErr } = await supabase
      .from('content_folders')
      .select('id, created_by')
      .eq('id', id)
      .single()

    if (fetchErr || !existing) {
      return c.json({ error: 'Folder not found' }, 404)
    }

    const isSuperuser = user.permissions === '*'
    if (!isSuperuser && existing.created_by !== user.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const { data, error } = await supabase
      .from('content_folders')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      console.error('[content/folders] update error:', error)
      return c.json({ error: 'Failed to rename folder' }, 500)
    }

    return c.json({ folder: rowToContentFolder(data) })
  }
)

// DELETE /content/folders/:id — delete a folder (cascades subfolders via DB FK)
contentFolderRoutes.delete(
  '/:id',
  requirePermission(PERMISSIONS.APP_CONTENT_UPLOAD),
  async (c) => {
    const id = c.req.param('id')
    const user = c.get('user')

    const { data: existing, error: fetchErr } = await supabase
      .from('content_folders')
      .select('id, created_by')
      .eq('id', id)
      .single()

    if (fetchErr || !existing) {
      return c.json({ error: 'Folder not found' }, 404)
    }

    const isSuperuser = user.permissions === '*'
    if (!isSuperuser && existing.created_by !== user.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const { error } = await supabase
      .from('content_folders')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[content/folders] delete error:', error)
      return c.json({ error: 'Failed to delete folder' }, 500)
    }

    return c.json({ ok: true })
  }
)

function rowToContentFolder(row: Record<string, unknown>): ContentFolder {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: row.created_by as string | null,
    name: row.name as string,
    parentId: row.parent_id as string | null,
  }
}
