import 'server-only'
import { Octokit } from '@octokit/rest'
import matter from 'gray-matter'

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

export interface BlogFileMeta {
  path: string // full repo-relative path, e.g. "/com.order332/src/content/blog/332/my-post.mdx"
  sha: string
}

export interface BlogPostListItem extends BlogFileMeta {
  author: string
  slug: string
  title: string
  description: string
  date: string
  draft: boolean
  tags: string[]
}

/**
 * Lists all .mdx files under basePath using a single recursive tree walk.
 * Fetches each file's content in parallel to parse frontmatter.
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
      item.path?.startsWith(normalizedBase) &&
      item.path.endsWith('.mdx'),
  )

  const posts = await Promise.all(
    mdxFiles.map(async (file) => {
      const fullPath = '/' + file.path!
      try {
        const { content, sha } = await getBlogPost(fullPath)
        const parsed = matter(content)
        const pathParts = file.path!.split('/')
        const slug = pathParts[pathParts.length - 1].replace(/\.mdx$/, '')
        const author = pathParts[pathParts.length - 2] ?? 'unknown'
        const fm = parsed.data as Record<string, unknown>
        return {
          path: fullPath,
          sha,
          author,
          slug,
          title: (fm.title as string) ?? slug,
          description: (fm.description as string) ?? '',
          date: parseFmDate(fm.date),
          draft: Boolean(fm.draft ?? false),
          tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
        } satisfies BlogPostListItem
      } catch {
        // Skip files that can't be fetched/parsed
        return null
      }
    }),
  )

  return posts.filter((p): p is BlogPostListItem => p !== null)
}

/**
 * Fetches a single blog post's raw MDX content and its current blob SHA.
 */
export async function getBlogPost(filePath: string): Promise<{ content: string; sha: string }> {
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
    throw new Error(`Path ${filePath} is not a file`)
  }

  const content = Buffer.from(data.content, 'base64').toString('utf-8')
  return { content, sha: data.sha }
}

export interface UpsertBlogPostParams {
  filePath: string
  content: string
  message: string
  sha?: string // omit for create, required for update
}

/**
 * Creates or updates a blog post file. Returns the new blob SHA so callers
 * can track it for subsequent saves (avoids 409 lost-update conflicts).
 */
export async function upsertBlogPost(params: UpsertBlogPostParams): Promise<{ newSha: string }> {
  const cfg = getConfig()
  const octokit = getOctokit()

  const normalizedPath = params.filePath.replace(/^\//, '')
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
  if (!newSha) {
    throw new Error('GitHub API did not return new blob SHA')
  }

  return { newSha }
}

export interface DeleteBlogPostParams {
  filePath: string
  sha: string
  message: string
}

/**
 * Hard-deletes a blog post file from GitHub. Only callable by superusers (enforced in route).
 */
export async function deleteBlogPost(params: DeleteBlogPostParams): Promise<void> {
  const cfg = getConfig()
  const octokit = getOctokit()

  const normalizedPath = params.filePath.replace(/^\//, '')

  await octokit.repos.deleteFile({
    owner: cfg.owner,
    repo: cfg.repo,
    path: normalizedPath,
    message: params.message,
    sha: params.sha,
    branch: cfg.branch,
  })
}
