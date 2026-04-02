'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import matter from 'gray-matter'
import { toast } from 'sonner'
import { ArrowLeft, Eye, EyeOff, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Spinner } from '@/components/ui/spinner'
import { FrontmatterPanel, type FrontmatterData } from '@/components/blog/FrontmatterPanel'
import { BlogPreview } from '@/components/blog/BlogPreview'
import { useAuthStore } from '@/lib/auth-store'
import { isSuperuserPermissionsCsv } from '@/lib/permissions'
import {
  fetchBlogPost,
  saveBlogPost,
  deleteBlogPost,
  uploadBlogImage,
  parseFrontmatterDate,
} from '@/lib/blog-api'

// Dynamic imports to avoid SSR issues with CodeMirror / TipTap
const MarkdownEditor = dynamic(
  () => import('@/components/blog/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center"><Spinner size="sm" /></div> },
)
const VisualEditor = dynamic(
  () => import('@/components/blog/VisualEditor').then((m) => m.VisualEditor),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center"><Spinner size="sm" /></div> },
)

const DEFAULT_FRONTMATTER: FrontmatterData = {
  title: '',
  description: '',
  date: new Date().toISOString().split('T')[0],
  author: '',
  tags: [],
  draft: true,
}

interface Props {
  author: string
  slug: string
}

export function BlogEditor({ author, slug }: Props) {
  const router = useRouter()
  const { user } = useAuthStore()
  const isSuperuser = user ? isSuperuserPermissionsCsv(user.permissions) : false

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bodyMarkdown, setBodyMarkdown] = useState('')
  const [frontmatter, setFrontmatter] = useState<FrontmatterData>(DEFAULT_FRONTMATTER)
  const [blobSha, setBlobSha] = useState('')
  const [editorMode, setEditorMode] = useState<'raw' | 'visual'>('raw')
  const [showPreview, setShowPreview] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [mobileTab, setMobileTab] = useState<'attributes' | 'edit' | 'preview'>('edit')

  // Warn on unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Load post from GitHub
  useEffect(() => {
    setLoading(true)
    fetchBlogPost(author, slug)
      .then(({ content, sha }) => {
        const parsed = matter(content)
        const fm = parsed.data as Partial<FrontmatterData>
        setFrontmatter({
          title: (fm.title as string) ?? '',
          description: (fm.description as string) ?? '',
          date: parseFrontmatterDate(fm.date as unknown),
          author: (fm.author as string) ?? '',
          tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
          draft: Boolean(fm.draft ?? true),
        })
        setBodyMarkdown(parsed.content.trimStart())
        setBlobSha(sha)
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false))
  }, [author, slug])

  const handleFrontmatterChange = useCallback((partial: Partial<FrontmatterData>) => {
    setFrontmatter((prev) => ({ ...prev, ...partial }))
    setIsDirty(true)
  }, [])

  const handleBodyChange = useCallback((md: string) => {
    setBodyMarkdown(md)
    setIsDirty(true)
  }, [])

  const buildContent = (fm: FrontmatterData) =>
    matter.stringify('\n' + bodyMarkdown, {
      title: fm.title,
      description: fm.description,
      date: fm.date,
      author: fm.author,
      tags: fm.tags,
      draft: fm.draft,
    })

  const handleSave = async (overrideDraft?: boolean) => {
    setSaving(true)
    const fm =
      overrideDraft !== undefined ? { ...frontmatter, draft: overrideDraft } : frontmatter
    const content = buildContent(fm)
    try {
      const { sha } = await saveBlogPost(author, slug, content, blobSha)
      setBlobSha(sha)
      setFrontmatter(fm)
      setIsDirty(false)
      toast.success(
        overrideDraft === false
          ? 'Published!'
          : overrideDraft === true
            ? 'Saved as draft'
            : 'Saved',
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Permanently delete this post from GitHub? This cannot be undone.')) return
    setDeleting(true)
    try {
      await deleteBlogPost(author, slug, blobSha)
      toast.success('Post deleted')
      router.push('/blog')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      toast.error(msg)
      setDeleting(false)
    }
  }

  const handleImageUpload = useCallback(async (file: File) => {
    const { url } = await uploadBlogImage(file)
    return url
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="md" clockwise />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive text-sm tracking-wider">{loadError}</p>
        <Link href="/blog" className="text-xs text-muted-foreground hover:text-foreground tracking-wide underline">
          ← Back to posts
        </Link>
      </div>
    )
  }

  const displaySlug = slug

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5 shrink-0">
        <Link
          href="/blog"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
        >
          <ArrowLeft size={13} />
          Posts
        </Link>
        <span className="text-white/20">|</span>
        <span className="flex-1 text-sm tracking-wide text-foreground truncate">
          {frontmatter.title || displaySlug}
          {isDirty && <span className="ml-1.5 text-muted-foreground text-xs">•</span>}
        </span>

        {/* Mode toggle */}
        <div className="hidden sm:flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setEditorMode('raw')}
            className={`rounded-md px-3 py-1 tracking-wide transition-colors ${
              editorMode === 'raw' ? 'bg-white/15 text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Raw
          </button>
          <button
            type="button"
            onClick={() => setEditorMode('visual')}
            className={`rounded-md px-3 py-1 tracking-wide transition-colors ${
              editorMode === 'visual' ? 'bg-white/15 text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Visual
          </button>
        </div>

        {/* Preview toggle */}
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          title={showPreview ? 'Hide preview' : 'Show preview'}
          className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
        >
          {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
          Preview
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {frontmatter.draft ? (
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium tracking-wide text-black hover:bg-white disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Publish'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={saving}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs tracking-wide text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Unpublish'}
              </button>
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={saving}
                className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium tracking-wide text-black hover:bg-white disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}

          {isSuperuser && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete post (superuser only)"
              className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              {deleting ? <Spinner size="sm" /> : <Trash2 size={14} />}
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Mobile tab bar */}
        <div className="sm:hidden flex shrink-0 border-b border-white/10">
          {(['attributes', 'edit', 'preview'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-2 text-xs tracking-wide capitalize transition-colors ${
                mobileTab === tab
                  ? 'border-b-2 border-white/60 text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {tab === 'attributes' ? 'Attributes' : tab === 'edit' ? 'Edit' : 'Preview'}
            </button>
          ))}
        </div>

        {/* Mobile: single active panel */}
        <div className="sm:hidden flex-1 overflow-hidden">
          {mobileTab === 'attributes' && (
            <FrontmatterPanel data={frontmatter} onChange={handleFrontmatterChange} />
          )}
          {mobileTab === 'edit' && (
            <MarkdownEditor
              value={bodyMarkdown}
              onChange={handleBodyChange}
              onImageUpload={handleImageUpload}
            />
          )}
          {mobileTab === 'preview' && <BlogPreview markdown={bodyMarkdown} />}
        </div>

        {/* Desktop: resizable panels */}
        <div className="hidden sm:block flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" className="h-full">
            {/* Frontmatter sidebar */}
            <Panel defaultSize={24} minSize={20} maxSize={40} className="border-r border-white/10">
              <FrontmatterPanel data={frontmatter} onChange={handleFrontmatterChange} />
            </Panel>

            <PanelResizeHandle className="w-2 bg-white/5 hover:bg-white/15 transition-colors data-[resize-handle-state=drag]:bg-white/20" />

            {/* Editor */}
            <Panel defaultSize={showPreview ? 38 : 76} minSize={15}>
              <div className="flex h-full flex-col">
                {editorMode === 'raw' ? (
                  <MarkdownEditor
                    value={bodyMarkdown}
                    onChange={handleBodyChange}
                    onImageUpload={handleImageUpload}
                  />
                ) : (
                  <VisualEditor
                    value={bodyMarkdown}
                    onChange={handleBodyChange}
                    onImageUpload={handleImageUpload}
                  />
                )}
              </div>
            </Panel>

            {showPreview && (
              <>
                <PanelResizeHandle className="w-2 bg-white/5 hover:bg-white/15 transition-colors data-[resize-handle-state=drag]:bg-white/20" />
                <Panel defaultSize={38} minSize={15} className="border-l border-white/10">
                  <BlogPreview markdown={bodyMarkdown} />
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>
      </div>
    </div>
  )
}
