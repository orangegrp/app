import 'server-only'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { isSuperuserPermissionsCsv, PERMISSIONS } from '@/lib/permissions'
import {
  listBlogPosts,
  getBlogPost,
  upsertBlogPost,
  deleteBlogPost,
} from '@/server/lib/github-blog'
import type { HonoEnv } from '@/server/lib/types'

export const blogPostRoutes = new Hono<HonoEnv>()
blogPostRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.APP_BLOG))

const createPostSchema = z.object({
  author: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+$/, 'author must be lowercase letters and numbers only'),
  slug: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  content: z.string().min(1).max(500_000),
})

const updatePostSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().min(1).max(500_000),
  sha: z.string().min(1),
  message: z.string().max(256).optional(),
})

const deletePostSchema = z.object({
  path: z.string().min(1).max(500),
  sha: z.string().min(1),
})

// GET /blog/posts          — list all posts with frontmatter metadata
// GET /blog/posts?path=... — fetch a single post by repo-relative path
blogPostRoutes.get('/', async (c) => {
  const rawPath = c.req.query('path')

  if (rawPath) {
    // Single post fetch — path passed as query param to avoid Hono wildcard routing issues
    const filePath = rawPath.startsWith('/') ? rawPath : '/' + rawPath
    try {
      const result = await getBlogPost(filePath)
      return c.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Post not found'
      const status = message.toLowerCase().includes('not found') ? 404 : 500
      return c.json({ error: message }, status)
    }
  }

  // List all posts
  try {
    const posts = await listBlogPosts()
    return c.json({ posts })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list posts'
    console.error('[blog/posts] GET error:', err)
    return c.json({ error: message }, 500)
  }
})

// POST /blog/posts — create a new post
blogPostRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createPostSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400)
  }

  const { author, slug, content } = parsed.data
  const basePath = process.env.GITHUB_BLOG_PATH ?? '/com.order332/src/content/blog'
  const filePath = `${basePath}/${author}/${slug}.mdx`

  // Check file doesn't already exist
  try {
    await getBlogPost(filePath)
    return c.json({ error: 'A post with this author/slug already exists' }, 409)
  } catch {
    // Expected — file doesn't exist yet
  }

  try {
    const { newSha } = await upsertBlogPost({
      filePath,
      content,
      message: `Add blog post: ${author}/${slug}`,
    })
    return c.json({ ok: true, path: filePath, sha: newSha }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create post'
    console.error('[blog/posts] POST error:', err)
    return c.json({ error: message }, 500)
  }
})

// PUT /blog/posts — update an existing post (save/publish/unpublish)
// path is in the request body to avoid URL routing issues with deep file paths
blogPostRoutes.put('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = updatePostSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400)
  }

  const { path: rawPath, content, sha, message } = parsed.data
  const filePath = rawPath.startsWith('/') ? rawPath : '/' + rawPath
  const pathParts = filePath.split('/')
  const slug = pathParts[pathParts.length - 1]?.replace(/\.mdx$/, '') ?? 'post'

  try {
    const { newSha } = await upsertBlogPost({
      filePath,
      content,
      sha,
      message: message ?? `Update blog post: ${slug}`,
    })
    return c.json({ ok: true, sha: newSha })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update post'
    const status = msg.includes('409') || msg.toLowerCase().includes('conflict') ? 409 : 500
    console.error('[blog/posts] PUT error:', err)
    return c.json(
      { error: status === 409 ? 'Post was modified by someone else — reload and try again' : msg },
      status,
    )
  }
})

// DELETE /blog/posts — hard-delete (superuser only)
// path is in the request body to avoid URL routing issues with deep file paths
blogPostRoutes.delete('/', async (c) => {
  const user = c.get('user')
  if (!isSuperuserPermissionsCsv(user.permissions)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = deletePostSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400)
  }

  const { path: rawPath, sha } = parsed.data
  const filePath = rawPath.startsWith('/') ? rawPath : '/' + rawPath
  const pathParts = filePath.split('/')
  const slug = pathParts[pathParts.length - 1]?.replace(/\.mdx$/, '') ?? 'post'

  try {
    await deleteBlogPost({
      filePath,
      sha,
      message: `Delete blog post: ${slug}`,
    })
    return c.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete post'
    console.error('[blog/posts] DELETE error:', err)
    return c.json({ error: message }, 500)
  }
})
