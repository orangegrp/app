'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import matter from 'gray-matter'
import { PageBackground } from '@/components/layout/PageBackground'
import { Spinner } from '@/components/ui/spinner'
import { useAuthStore } from '@/lib/auth-store'
import { createBlogPost } from '@/lib/blog-api'

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildInitialContent(author: string, slug: string): string {
  const title = slug.replace(/-/g, ' ')
  return matter.stringify('\n\nWrite your post here.\n', {
    title,
    description: '',
    date: new Date().toISOString().split('T')[0],
    author,
    tags: [],
    draft: true,
  })
}

const SLUG_RE = /^[a-z0-9-]+$/
const AUTHOR_RE = /^[a-z0-9-]+$/

export default function NewBlogPostPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const defaultAuthor = user?.displayName ? toKebab(user.displayName) : ''

  const [author, setAuthor] = useState(defaultAuthor)
  const [slug, setSlug] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const authorError = author && !AUTHOR_RE.test(author) ? 'Use lowercase letters, numbers, and hyphens only' : null
  const slugError = slug && !SLUG_RE.test(slug) ? 'Use lowercase letters, numbers, and hyphens only' : null
  const canSubmit = AUTHOR_RE.test(author) && SLUG_RE.test(slug) && !creating

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setCreating(true)
    setError(null)
    try {
      const content = buildInitialContent(author, slug)
      const { path } = await createBlogPost(author, slug, content)
      // path: /com.order332/src/content/blog/332/my-post.mdx
      router.push('/blog/edit' + path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
      setCreating(false)
    }
  }

  return (
    <div className="page-root relative min-h-screen px-6 pb-32 pt-8 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-lg">
        <Link
          href="/blog"
          className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
        >
          <ArrowLeft size={13} />
          Back to posts
        </Link>

        <p className="section-label">Blog Admin</p>
        <h2 className="mb-8 text-4xl tracking-widest text-foreground">
          New Post<span className="blink-cursor">_</span>
        </h2>

        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs tracking-wide text-muted-foreground" htmlFor="author">
              Author <span className="text-muted-foreground/60">(kebab-case)</span>
            </label>
            <input
              id="author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="332"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
              required
              autoComplete="off"
            />
            {authorError && <p className="text-xs text-destructive">{authorError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs tracking-wide text-muted-foreground" htmlFor="slug">
              Slug <span className="text-muted-foreground/60">(kebab-case, becomes the URL)</span>
            </label>
            <input
              id="slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-first-post"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
              required
              autoComplete="off"
            />
            {slugError && <p className="text-xs text-destructive">{slugError}</p>}
            {author && slug && !slugError && !authorError && (
              <p className="text-xs text-muted-foreground/60 font-mono">
                {author}/{slug}.mdx
              </p>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-white/90 px-4 py-2.5 text-sm font-medium tracking-wide text-black hover:bg-white disabled:opacity-40 transition-colors"
          >
            {creating ? (
              <>
                <Spinner size="sm" />
                Creating…
              </>
            ) : (
              'Create Post'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
