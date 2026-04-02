'use client'

import Link from 'next/link'
import { FileText, Eye, EyeOff, Calendar, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { BlogPostMeta } from '@/lib/blog-api'

interface Props {
  posts: BlogPostMeta[]
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export function BlogPostList({ posts }: Props) {
  const sorted = [...posts].sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  if (sorted.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center">
        <FileText className="mx-auto mb-4 opacity-30" size={40} />
        <p className="text-muted-foreground tracking-wider text-sm">No posts yet. Create your first one.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((post) => (
        <Link
          key={`${post.author}/${post.slug}`}
          href={`/blog/edit/${encodeURIComponent(post.author)}/${encodeURIComponent(post.slug)}`}
          className="glass-card group flex flex-col gap-3 rounded-2xl p-5 transition-all hover:bg-white/[0.07] hover:-translate-y-0.5"
        >
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium tracking-wide text-foreground text-sm leading-snug line-clamp-2 flex-1">
              {post.title || post.slug}
            </h3>
            <span className="shrink-0 mt-0.5 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
              {post.draft ? <EyeOff size={13} /> : <Eye size={13} />}
            </span>
          </div>

          {/* Description */}
          {post.description && (
            <p className="text-xs text-muted-foreground tracking-wide line-clamp-2 leading-relaxed">
              {post.description}
            </p>
          )}

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.tags.slice(0, 4).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] tracking-wide border-white/10 text-muted-foreground"
                >
                  {tag}
                </Badge>
              ))}
              {post.tags.length > 4 && (
                <span className="text-[10px] text-muted-foreground/50 tracking-wide self-center">
                  +{post.tags.length - 4}
                </span>
              )}
            </div>
          )}

          {/* Footer: author · date · draft badge */}
          <div className="mt-auto flex items-center justify-between gap-2 pt-1 border-t border-white/5">
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70 tracking-wide">
              <span className="flex items-center gap-1">
                <User size={10} />
                {post.author}
              </span>
              {post.date && (
                <span className="flex items-center gap-1">
                  <Calendar size={10} />
                  {formatDate(post.date)}
                </span>
              )}
            </div>
            {post.draft && (
              <Badge
                variant="outline"
                className="px-1.5 py-0 text-[10px] tracking-wide border-yellow-500/30 text-yellow-400/80"
              >
                Draft
              </Badge>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}
