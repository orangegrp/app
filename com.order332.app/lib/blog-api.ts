import { apiGet, apiPost, apiFetch, apiDelete } from './api-client'
import { useAuthStore } from './auth-store'

export interface BlogPostMeta {
  author: string
  slug: string
  sha: string
  title: string
  description: string
  date: string
  draft: boolean
  tags: string[]
}

/**
 * gray-matter parses YAML date values as JS Date objects, not strings.
 * Normalises either representation to a YYYY-MM-DD string.
 */
export function parseFrontmatterDate(value: unknown): string {
  if (!value) return new Date().toISOString().split('T')[0]
  if (value instanceof Date) return value.toISOString().split('T')[0]
  const s = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0]
  try { return new Date(s).toISOString().split('T')[0] } catch { return s }
}

export async function fetchBlogPosts(): Promise<{ posts: BlogPostMeta[] }> {
  return apiGet<{ posts: BlogPostMeta[] }>('/blog/posts')
}

export async function fetchBlogPost(
  author: string,
  slug: string,
): Promise<{ content: string; sha: string }> {
  return apiGet<{ content: string; sha: string }>(
    `/blog/posts?author=${encodeURIComponent(author)}&slug=${encodeURIComponent(slug)}`,
  )
}

export async function createBlogPost(
  author: string,
  slug: string,
  content: string,
): Promise<{ ok: boolean; author: string; slug: string; sha: string }> {
  return apiPost<{ ok: boolean; author: string; slug: string; sha: string }>('/blog/posts', {
    author,
    slug,
    content,
  })
}

export async function saveBlogPost(
  author: string,
  slug: string,
  content: string,
  sha: string,
  message?: string,
): Promise<{ ok: boolean; sha: string }> {
  const res = await apiFetch('/blog/posts', {
    method: 'PUT',
    body: JSON.stringify({ author, slug, content, sha, message }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'Save failed' }))) as { error: string }
    throw new Error(err.error)
  }
  return res.json() as Promise<{ ok: boolean; sha: string }>
}

export async function deleteBlogPost(
  author: string,
  slug: string,
  sha: string,
): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>('/blog/posts', { author, slug, sha })
}

/**
 * Uploads a blog image directly via fetch (not apiPost) so the browser
 * sets the correct multipart/form-data Content-Type with boundary.
 */
export async function uploadBlogImage(file: File): Promise<{ url: string }> {
  const { accessToken } = useAuthStore.getState()
  const fd = new FormData()
  fd.append('file', file)

  const res = await fetch('/api/blog/images', {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: fd,
    credentials: 'include',
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'Upload failed' }))) as { error: string }
    throw new Error(err.error)
  }

  return res.json() as Promise<{ url: string }>
}
