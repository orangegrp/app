import 'server-only'
import { Hono } from 'hono'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { PERMISSIONS } from '@/lib/permissions'
import {
  BLOG_IMAGE_ALLOWED_TYPES,
  BLOG_IMAGE_MAX_SIZE,
  uploadBlogImageBuffer,
} from '@/server/lib/blog-image-upload'
import type { HonoEnv } from '@/server/lib/types'

export const blogImageRoutes = new Hono<HonoEnv>()
blogImageRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.APP_BLOG))

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
