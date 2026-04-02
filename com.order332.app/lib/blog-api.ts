import { apiGet, apiPost, apiFetch, apiDelete } from './api-client'
import { useAuthStore } from './auth-store'

/**
 * gray-matter parses YAML date values as JS Date objects, not strings.
 * This helper normalises either representation to a YYYY-MM-DD string.
 */
export function parseFrontmatterDate(value: unknown): string {
  if (!value) return new Date().toISOString().split('T')[0]
  if (value instanceof Date) return value.toISOString().split('T')[0]
  const s = String(value)
  // Already ISO-like (YYYY-MM-DD or YYYY-MM-DDTHH:...)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0]
  // Fallback — try parsing whatever string we got
  try {
    return new Date(s).toISOString().split('T')[0]
  } catch {
    return s
  }
}

export interface BlogPostMeta {
  path: string
  sha: string
  author: string
  slug: string
  title: string
  description: string
  date: string
  draft: boolean
  tags: string[]
}

export async function fetchBlogPosts(): Promise<{ posts: BlogPostMeta[] }> {
  return apiGet<{ posts: BlogPostMeta[] }>('/blog/posts')
}

export async function fetchBlogPost(repoPath: string): Promise<{ content: string; sha: string }> {
  // Pass path as a query param — avoids Hono wildcard routing issues with deep paths
  return apiGet<{ content: string; sha: string }>(
    `/blog/posts?path=${encodeURIComponent(repoPath)}`,
  )
}

export async function createBlogPost(
  author: string,
  slug: string,
  content: string,
): Promise<{ ok: boolean; path: string; sha: string }> {
  return apiPost<{ ok: boolean; path: string; sha: string }>('/blog/posts', {
    author,
    slug,
    content,
  })
}

export async function saveBlogPost(
  repoPath: string,
  content: string,
  sha: string,
  message?: string,
): Promise<{ ok: boolean; sha: string }> {
  // path is in the body — avoids URL routing issues
  const res = await apiFetch('/blog/posts', {
    method: 'PUT',
    body: JSON.stringify({ path: repoPath, content, sha, message }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'Save failed' }))) as { error: string }
    throw new Error(err.error)
  }
  return res.json() as Promise<{ ok: boolean; sha: string }>
}

export async function deleteBlogPost(repoPath: string, sha: string): Promise<{ ok: boolean }> {
  // path is in the body — avoids URL routing issues
  return apiDelete<{ ok: boolean }>('/blog/posts', { path: repoPath, sha })
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
