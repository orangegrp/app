import 'server-only'
import { Hono } from 'hono'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { PERMISSIONS } from '@/lib/permissions'
import { supabase } from '@/server/db/supabase/client'
import type { HonoEnv } from '@/server/lib/types'

export const blogImageRoutes = new Hono<HonoEnv>()
blogImageRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.APP_BLOG))

const BUCKET = 'blog-images'
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
])

/** Ensures the blog-images bucket exists (idempotent). */
async function ensureBucket(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (buckets?.some((b) => b.id === BUCKET)) return

  await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_SIZE,
    allowedMimeTypes: [...ALLOWED_TYPES],
  })
}

// POST /blog/images — upload a blog image, returns public URL
blogImageRoutes.post('/', async (c) => {
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

  if (!ALLOWED_TYPES.has(file.type)) {
    return c.json({ error: `Unsupported file type: ${file.type}` }, 400)
  }
  if (file.size > MAX_SIZE) {
    return c.json({ error: 'File exceeds 10 MB limit' }, 400)
  }

  const user = c.get('user')
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const rand = Math.random().toString(36).slice(2, 10)
  const key = `${user.id}/${Date.now()}-${rand}.${ext}`

  try {
    await ensureBucket()
  } catch (err) {
    console.error('[blog/images] ensureBucket error:', err)
    // Non-fatal — bucket may already exist; proceed
  }

  const buffer = await file.arrayBuffer()
  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType: file.type,
    upsert: false,
  })

  if (error) {
    console.error('[blog/images] upload error:', error)
    return c.json({ error: 'Upload failed' }, 500)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(key)

  return c.json({ url: publicUrl }, 201)
})
