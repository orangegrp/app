import 'server-only'
import { Hono } from 'hono'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { rateLimit } from '@/server/middleware/rate-limit'
import { PERMISSIONS } from '@/lib/permissions'
import {
  BLOG_IMAGE_ALLOWED_TYPES,
  BLOG_IMAGE_MAX_SIZE,
  BLOG_IMAGES_BUCKET,
  uploadBlogImageBuffer,
} from '@/server/lib/blog-image-upload'
import { getAllBlogPostRawContents } from '@/server/lib/github-blog'
import { supabase } from '@/server/db/supabase/client'
import type { HonoEnv } from '@/server/lib/types'

export const blogImageRoutes = new Hono<HonoEnv>()
blogImageRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.APP_BLOG))

// POST /blog/images — upload a blog image, returns public URL
blogImageRoutes.post('/', rateLimit(20, 60_000), async (c) => {
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

  if (!BLOG_IMAGE_ALLOWED_TYPES.has(file.type)) {
    return c.json({ error: `Unsupported file type: ${file.type}` }, 400)
  }
  if (file.size > BLOG_IMAGE_MAX_SIZE) {
    return c.json({ error: 'File exceeds 10 MB limit' }, 400)
  }

  const user = c.get('user')

  try {
    const buffer = await file.arrayBuffer()
    const { publicUrl } = await uploadBlogImageBuffer({
      userId: user.id,
      buffer,
      contentType: file.type,
      filenameHint: file.name,
    })
    return c.json({ url: publicUrl }, 201)
  } catch (err) {
    console.error('[blog/images] upload error:', err)
    return c.json({ error: 'Upload failed' }, 500)
  }
})

// GET /blog/images — returns images uploaded by this user that are not referenced in any saved blog post
blogImageRoutes.get('/', async (c) => {
  const user = c.get('user')

  const [storageResult, allContents] = await Promise.all([
    supabase.storage.from(BLOG_IMAGES_BUCKET).list(user.id, {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'desc' },
    }),
    getAllBlogPostRawContents().catch((err) => {
      console.error('[blog/images] getAllBlogPostRawContents error:', err)
      return [] as string[]
    }),
  ])

  if (storageResult.error) {
    console.error('[blog/images] list error:', storageResult.error)
    return c.json({ error: 'Failed to list images' }, 500)
  }

  const combinedContent = allContents.join('\n')

  const stray = (storageResult.data ?? [])
    .filter((f) => f.name !== '.emptyFolderPlaceholder')
    .map((f) => {
      const key = `${user.id}/${f.name}`
      const { data: { publicUrl } } = supabase.storage.from(BLOG_IMAGES_BUCKET).getPublicUrl(key)
      return { name: f.name, url: publicUrl, size: (f.metadata as { size?: number } | null)?.size ?? null }
    })
    .filter((f) => !combinedContent.includes(f.url))

  return c.json({ images: stray })
})

// DELETE /blog/images — delete a blog image from Supabase Storage by URL
blogImageRoutes.delete('/', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const url = typeof body === 'object' && body !== null && 'url' in body ? (body as { url?: unknown }).url : undefined
  if (typeof url !== 'string' || !url) {
    return c.json({ error: 'Missing url' }, 400)
  }

  // Extract storage key from public URL: .../blog-images/{key}
  const marker = `/${BLOG_IMAGES_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) {
    return c.json({ error: 'Invalid image URL' }, 400)
  }
  // Strip any query string
  const key = url.slice(idx + marker.length).split('?')[0]

  // Reject path traversal sequences
  if (key.includes('..') || key.includes('//')) {
    return c.json({ error: 'Invalid image URL' }, 400)
  }

  // Only allow deleting own images
  const user = c.get('user')
  if (!key.startsWith(`${user.id}/`)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const { error } = await supabase.storage.from(BLOG_IMAGES_BUCKET).remove([key])
  if (error) {
    console.error('[blog/images] delete error:', error)
    return c.json({ error: 'Delete failed' }, 500)
  }
  return c.json({ ok: true })
})
