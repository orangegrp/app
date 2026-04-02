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

// ── Validated input schemas ───────────────────────────────────────────────────
// Paths are NEVER accepted from the client. Only author + slug travel over the
// wire. The server constructs and validates the GitHub path from these alone.

const authorSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/, 'author must be lowercase letters and numbers only')

const slugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, numbers and hyphens only')

const createPostSchema = z.object({
  author: authorSchema,
  slug: slugSchema,
  content: z.string().min(1).max(500_000),
})

const getSingleSchema = z.object({
  author: authorSchema,
  slug: slugSchema,
})

const updatePostSchema = z.object({
  author: authorSchema,
  slug: slugSchema,
  content: z.string().min(1).max(500_000),
  sha: z.string().min(1),
  message: z.string().max(256).optional(),
})

const deletePostSchema = z.object({
  author: authorSchema,
  slug: slugSchema,
  sha: z.string().min(1),
})

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /blog/posts             — list all posts
// GET /blog/posts?author=&slug= — fetch single post
blogPostRoutes.get('/', async (c) => {
  const rawAuthor = c.req.query('author')
  const rawSlug = c.req.query('slug')

  if (rawAuthor !== undefined || rawSlug !== undefined) {
    // Single post fetch — validate query params before touching GitHub
    const parsed = getSingleSchema.safeParse({ author: rawAuthor, slug: rawSlug })
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400)
    }
    try {
      const result = await getBlogPost(parsed.data.author, parsed.data.slug)
      return c.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Post not found'
      const status = message.toLowerCase().includes('not found') || message.includes('404') ? 404 : 500
      return c.json({ error: message }, status)
    }
  }

  // List all posts
  try {
    const posts = await listBlogPosts()
    return c.json({ posts })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list posts'
    console.error('[blog/posts] GET list error:', err)
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

  // Check file doesn't already exist
  try {
    await getBlogPost(author, slug)
    return c.json({ error: 'A post with this author/slug already exists' }, 409)
  } catch {
    // Expected — file doesn't exist yet
  }

  try {
    const { newSha } = await upsertBlogPost({
      author,
      slug,
      content,
      message: `Add blog post: ${author}/${slug}`,
    })
    return c.json({ ok: true, author, slug, sha: newSha }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create post'
    console.error('[blog/posts] POST error:', err)
    return c.json({ error: message }, 500)
  }
})

// PUT /blog/posts — update an existing post (save / publish / unpublish)
blogPostRoutes.put('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = updatePostSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400)
  }

  const { author, slug, content, sha, message } = parsed.data

  try {
    const { newSha } = await upsertBlogPost({
      author,
      slug,
      content,
      sha,
      message: message ?? `Update blog post: ${author}/${slug}`,
    })
    return c.json({ ok: true, sha: newSha })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update post'
    const status = msg.includes('409') || msg.toLowerCase().includes('conflict') ? 409 : 500
    console.error('[blog/posts] PUT error:', err)
    return c.json(
      { error: status === 409 ? 'Post was modified externally — reload and try again' : msg },
      status,
    )
  }
})

// DELETE /blog/posts — hard-delete (superuser only)
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

  const { author, slug, sha } = parsed.data

  try {
    await deleteBlogPost({
      author,
      slug,
      sha,
      message: `Delete blog post: ${author}/${slug}`,
    })
    return c.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete post'
    console.error('[blog/posts] DELETE error:', err)
    return c.json({ error: message }, 500)
  }
})
