'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PageBackground } from '@/components/layout/PageBackground'
import { Spinner } from '@/components/ui/spinner'
import { BlogPostList } from '@/components/blog/BlogPostList'
import { fetchBlogPosts, type BlogPostMeta } from '@/lib/blog-api'

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPostMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBlogPosts()
      .then(({ posts }) => setPosts(posts))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page-root relative min-h-screen px-6 pb-32 pt-8 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl">
        <p className="section-label">Blog Admin</p>
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-4xl tracking-widest text-foreground">
            Blog Admin<span className="blink-cursor">_</span>
          </h2>
          <Link
            href="/blog/new"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm tracking-widest text-foreground hover:bg-white/10 transition-colors"
          >
            <Plus size={15} />
            New Post
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="md" clockwise />
          </div>
        ) : error ? (
          <div className="glass-card rounded-2xl p-8">
            <p className="text-destructive text-sm tracking-wider">{error}</p>
          </div>
        ) : (
          <BlogPostList posts={posts} />
        )}
      </div>
    </div>
  )
}
