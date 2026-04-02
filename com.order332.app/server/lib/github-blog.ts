import 'server-only'
import { Octokit } from '@octokit/rest'
import matter from 'gray-matter'

// ── Validation constants ──────────────────────────────────────────────────────
// These are the ONLY characters permitted in author/slug identifiers.
// Validated on every code-path that touches the filesystem.
const AUTHOR_RE = /^[a-z0-9]+$/
const SLUG_RE = /^[a-z0-9-]+$/

function parseFmDate(value: unknown): string {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().split('T')[0]
  const s = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0]
  try { return new Date(s).toISOString().split('T')[0] } catch { return s }
}

interface GitHubBlogConfig {
  token: string
  owner: string
  repo: string
  branch: string
  basePath: string // e.g. "/com.order332/src/content/blog"
}

function getConfig(): GitHubBlogConfig {
  const token = process.env.GITHUB_TOKEN
  const repoFull = process.env.GITHUB_BLOG_REPO
  const branch = process.env.GITHUB_BLOG_BRANCH
  const basePath = process.env.GITHUB_BLOG_PATH

  if (!token || !repoFull || !branch || !basePath) {
    throw new Error(
      'Missing GitHub blog config: GITHUB_TOKEN, GITHUB_BLOG_REPO, GITHUB_BLOG_BRANCH, GITHUB_BLOG_PATH are all required',
    )
  }

  const [owner, repo] = repoFull.split('/')
  if (!owner || !repo) {
    throw new Error('GITHUB_BLOG_REPO must be in owner/repo format')
  }

  return { token, owner, repo, branch, basePath }
}

let _octokit: Octokit | null = null

function getOctokit(): Octokit {
  if (!_octokit) {
    const { token } = getConfig()
    _octokit = new Octokit({ auth: token })
  }
  return _octokit
}

/**
 * Constructs the repo-relative file path from trusted, validated components.
 * NEVER call GitHub API functions with a path that hasn't gone through here.
 *
 * Throws if author or slug fail validation, or if the resulting path escapes
 * the configured base directory (defense-in-depth against env var injection).
 */
export function buildBlogFilePath(author: string, slug: string): string {
  if (!AUTHOR_RE.test(author)) {
    throw new Error('Invalid author: must be lowercase letters and numbers only')
  }
  if (!SLUG_RE.test(slug)) {
    throw new Error('Invalid slug: must be lowercase letters, numbers and hyphens only')
  }

  const cfg = getConfig()
  const base = cfg.basePath.replace(/\/+$/, '') // strip any trailing slash

  // Construct from known-safe parts only
  const filePath = `${base}/${author}/${slug}.mdx`

  // Defense-in-depth: reject traversal sequences even if they somehow appeared
  // in the config values themselves (e.g. misconfigured GITHUB_BLOG_PATH).
  const normalised = filePath.replace(/\\/g, '/')
  if (normalised.includes('..') || normalised.includes('//') || normalised.includes('\0')) {
    throw new Error('Path validation failed: unsafe characters in constructed path')
  }

  // Final containment check: constructed path must start with the base directory.
  if (!normalised.startsWith(base + '/')) {
    throw new Error('Path validation failed: constructed path escapes base directory')
  }

  return filePath
}

export interface BlogPostListItem {
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
 * Lists all .mdx files under basePath using a single recursive tree walk.
 * Only files whose author/slug segments pass validation are returned.
 */
export async function listBlogPosts(): Promise<BlogPostListItem[]> {
  const cfg = getConfig()
  const octokit = getOctokit()

  const { data: branch } = await octokit.repos.getBranch({
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch,
  })

  const treeSha = branch.commit.commit.tree.sha

  const { data: tree } = await octokit.git.getTree({
    owner: cfg.owner,
    repo: cfg.repo,
    tree_sha: treeSha,
    recursive: '1',
  })

  const normalizedBase = cfg.basePath.replace(/^\//, '')

  const mdxFiles = (tree.tree ?? []).filter(
    (item) =>
      item.type === 'blob' &&
      item.path?.startsWith(normalizedBase + '/') &&
      item.path.endsWith('.mdx'),
  )

  const posts = await Promise.all(
    mdxFiles.map(async (file) => {
      const pathParts = file.path!.split('/')
      const rawSlug = pathParts[pathParts.length - 1].replace(/\.mdx$/, '')
      const rawAuthor = pathParts[pathParts.length - 2] ?? ''

      // Skip any file whose author/slug fail validation — these aren't our posts
      if (!AUTHOR_RE.test(rawAuthor) || !SLUG_RE.test(rawSlug)) return null

      try {
        // Use buildBlogFilePath to get the validated path — never use file.path directly
        const filePath = buildBlogFilePath(rawAuthor, rawSlug)
        const { content, sha } = await fetchBlogFile(filePath)
        const parsed = matter(content)
        const fm = parsed.data as Record<string, unknown>
        return {
          author: rawAuthor,
          slug: rawSlug,
          sha,
          title: (fm.title as string) ?? rawSlug,
          description: (fm.description as string) ?? '',
          date: parseFmDate(fm.date),
          draft: Boolean(fm.draft ?? false),
          tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
        } satisfies BlogPostListItem
      } catch {
        return null
      }
    }),
  )

  return posts.filter((p): p is BlogPostListItem => p !== null)
}

/**
 * Internal: fetches raw file content by a pre-validated repo-relative path.
 * Not exported — callers must use getBlogPost(author, slug) instead.
 */
async function fetchBlogFile(filePath: string): Promise<{ content: string; sha: string }> {
  const cfg = getConfig()
  const octokit = getOctokit()
  const normalizedPath = filePath.replace(/^\//, '')

  const { data } = await octokit.repos.getContent({
    owner: cfg.owner,
    repo: cfg.repo,
    path: normalizedPath,
    ref: cfg.branch,
  })

  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`Not a file: ${normalizedPath}`)
  }

  return {
    content: Buffer.from(data.content, 'base64').toString('utf-8'),
    sha: data.sha,
  }
}

/**
 * Fetches a blog post by author + slug. Validates both before constructing path.
 */
export async function getBlogPost(
  author: string,
  slug: string,
): Promise<{ content: string; sha: string }> {
  const filePath = buildBlogFilePath(author, slug)
  return fetchBlogFile(filePath)
}

export interface UpsertBlogPostParams {
  author: string
  slug: string
  content: string
  message: string
  sha?: string
}

/**
 * Creates or updates a blog post. Validates author/slug before touching GitHub.
 */
export async function upsertBlogPost(params: UpsertBlogPostParams): Promise<{ newSha: string }> {
  const cfg = getConfig()
  const octokit = getOctokit()

  const filePath = buildBlogFilePath(params.author, params.slug)
  const normalizedPath = filePath.replace(/^\//, '')
  const encodedContent = Buffer.from(params.content, 'utf-8').toString('base64')

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner: cfg.owner,
    repo: cfg.repo,
    path: normalizedPath,
    message: params.message,
    content: encodedContent,
    branch: cfg.branch,
    sha: params.sha,
  })

  const newSha = data.content?.sha
  if (!newSha) throw new Error('GitHub API did not return new blob SHA')

  return { newSha }
}

export interface DeleteBlogPostParams {
  author: string
  slug: string
  sha: string
  message: string
}

/**
 * Hard-deletes a blog post. Validates author/slug before touching GitHub.
 * Superuser gate is enforced in the route handler.
 */
export async function deleteBlogPost(params: DeleteBlogPostParams): Promise<void> {
  const cfg = getConfig()
  const octokit = getOctokit()

  const filePath = buildBlogFilePath(params.author, params.slug)
  const normalizedPath = filePath.replace(/^\//, '')

  await octokit.repos.deleteFile({
    owner: cfg.owner,
    repo: cfg.repo,
    path: normalizedPath,
    message: params.message,
    sha: params.sha,
    branch: cfg.branch,
  })
}
