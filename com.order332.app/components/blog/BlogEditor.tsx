'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import matter from 'gray-matter'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Eye,
  EyeOff,
  MoreVertical,
  NotebookPen,
  PenLine,
  Save,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Spinner } from '@/components/ui/spinner'
import { FrontmatterPanel, type FrontmatterData } from '@/components/blog/FrontmatterPanel'
import { BlogPreview } from '@/components/blog/BlogPreview'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import { useAuthStore } from '@/lib/auth-store'
import { isSuperuserPermissionsCsv, PERMISSIONS } from '@/lib/permissions'
import { usePermission } from '@/hooks/usePermission'
import {
  fetchBlogPost,
  saveBlogPost,
  deleteBlogPost,
  uploadBlogImage,
  parseFrontmatterDate,
} from '@/lib/blog-api'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import type { MarkdownEditorHandle } from '@/components/blog/MarkdownEditor'
import type { VisualEditorHandle } from '@/components/blog/VisualEditor'
import {
  BlogAiAssistLayer,
  type BlogAiEditorHandle,
  type BlogSelectionFormatActions,
} from '@/components/blog/BlogAiAssistLayer'
import { BlogQuickDraftDialog } from '@/components/blog/BlogQuickDraftDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
  const canBlogAi = usePermission(PERMISSIONS.APP_BLOG_AI)

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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickDraftOpen, setQuickDraftOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [isMac] = useState(
    () => typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform),
  )

  const markdownEditorRef = useRef<MarkdownEditorHandle>(null)
  const visualEditorRef = useRef<VisualEditorHandle>(null)

  const [aiSelRevision, setAiSelRevision] = useState(0)
  const bumpAiSelection = useCallback(() => setAiSelRevision((n) => n + 1), [])

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

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 640px)')
    const sync = () => setIsDesktop(mql.matches)
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!canBlogAi) return
    const onScroll = () => bumpAiSelection()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [canBlogAi, bumpAiSelection])

  // Ctrl/Cmd+A (select all) — bump revision after the editor applies selection so the AI popover shows.
  useEffect(() => {
    if (!canBlogAi) return
    const onSelectAll = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key.toLowerCase() !== 'a') return
      const el = document.activeElement
      if (!el || !(el instanceof Element)) return
      if (!el.closest('.cm-editor, .ProseMirror')) return
      requestAnimationFrame(() => {
        requestAnimationFrame(() => bumpAiSelection())
      })
    }
    window.addEventListener('keydown', onSelectAll, true)
    return () => window.removeEventListener('keydown', onSelectAll, true)
  }, [canBlogAi, bumpAiSelection])

  useEffect(() => {
    bumpAiSelection()
  }, [editorMode, mobileTab, isDesktop, bumpAiSelection])

  const getActiveAiEditor = useCallback((): BlogAiEditorHandle | null => {
    if (!isDesktop) {
      if (mobileTab !== 'edit') return null
      return markdownEditorRef.current
    }
    if (editorMode === 'raw') return markdownEditorRef.current
    return visualEditorRef.current
  }, [isDesktop, mobileTab, editorMode])

  const selectionFormatActions = useMemo<BlogSelectionFormatActions>(
    () => ({
      bold: () => {
        if (isDesktop && editorMode === 'visual') visualEditorRef.current?.toggleBold()
        else markdownEditorRef.current?.wrapSelection('**', '**')
      },
      italic: () => {
        if (isDesktop && editorMode === 'visual') visualEditorRef.current?.toggleItalic()
        else markdownEditorRef.current?.wrapSelection('*', '*')
      },
      code: () => {
        if (isDesktop && editorMode === 'visual') visualEditorRef.current?.toggleCode()
        else markdownEditorRef.current?.wrapSelection('`', '`')
      },
      strike: () => {
        if (isDesktop && editorMode === 'visual') visualEditorRef.current?.toggleStrike()
        else markdownEditorRef.current?.wrapSelection('~~', '~~')
      },
      link: () => {
        if (isDesktop && editorMode === 'visual') visualEditorRef.current?.openLinkDialog()
        else markdownEditorRef.current?.wrapSelection('[', '](https://)')
      },
      heading1: () => {
        if (isDesktop && editorMode === 'visual') visualEditorRef.current?.toggleHeading1()
        else markdownEditorRef.current?.prefixHeadingLine(1)
      },
      heading2: () => {
        if (isDesktop && editorMode === 'visual') visualEditorRef.current?.toggleHeading2()
        else markdownEditorRef.current?.prefixHeadingLine(2)
      },
    }),
    [isDesktop, editorMode],
  )

  // ⌘P / Ctrl+P → toggle command palette (override browser print)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() !== 'p') return
      e.preventDefault()
      e.stopPropagation()
      setPaletteOpen((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

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

  const closePalette = useCallback(() => setPaletteOpen(false), [])

  const handleQuickDraftInsert = useCallback(
    (markdown: string) => {
      getActiveAiEditor()?.insertAfterSelection(markdown)
      bumpAiSelection()
    },
    [getActiveAiEditor, bumpAiSelection],
  )

  const handleInsertImageAsset = useCallback((url: string) => {
    if (visualEditorRef.current && (editorMode === 'visual' || mobileTab === 'edit')) {
      visualEditorRef.current.insertImage(url)
    } else {
      handleBodyChange(`${bodyMarkdown}\n\n![](${url})\n`)
    }
  }, [editorMode, mobileTab, bodyMarkdown, handleBodyChange])

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

  const canUseVisualFormatting = isDesktop && editorMode === 'visual'
  const canUseRawImage =
    (isDesktop && editorMode === 'raw') || (!isDesktop && mobileTab === 'edit')
  const canUseVisualImage = canUseVisualFormatting

  const runVisual = (fn: (api: VisualEditorHandle) => void) => {
    if (!canUseVisualFormatting) return
    const api = visualEditorRef.current
    if (!api) return
    fn(api)
  }

  const mobileTabs: { id: 'attributes' | 'edit' | 'preview'; label: string; icon: typeof SlidersHorizontal }[] = [
    { id: 'attributes', label: 'Attributes', icon: SlidersHorizontal },
    { id: 'edit', label: 'Edit', icon: PenLine },
    { id: 'preview', label: 'Preview', icon: Eye },
  ]

  const draftTitleBadge =
    frontmatter.draft ? (
      <span
        className="shrink-0 rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200/90"
        aria-label="Draft post"
      >
        Draft
      </span>
    ) : null

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header — mobile */}
      <header className="flex sm:hidden items-center gap-2 border-b border-white/10 px-3 py-3 shrink-0">
        <Link
          href="/blog"
          className="flex shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground min-h-11 min-w-11"
          aria-label="Back to posts"
        >
          <ArrowLeft size={18} strokeWidth={1.5} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate text-sm font-medium tracking-wide text-foreground">
              {frontmatter.title || displaySlug}
            </p>
            {draftTitleBadge}
          </div>
          {isDirty ? (
            <p className="text-[10px] tracking-wider text-muted-foreground">Unsaved changes</p>
          ) : (
            <p className="text-[10px] tracking-wider text-muted-foreground/70">Blog post</p>
          )}
        </div>
        {frontmatter.draft ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2.5 text-[11px] font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 min-h-11"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => void handleSave(false)}
              disabled={saving}
              className="rounded-lg bg-white/90 px-2.5 py-2.5 text-[11px] font-medium tracking-wide text-black transition-colors hover:bg-white disabled:opacity-50 min-h-11"
            >
              {saving ? 'Saving…' : 'Publish'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white/90 px-3 py-2.5 text-xs font-medium tracking-wide text-black transition-colors hover:bg-white disabled:opacity-50 min-h-11"
          >
            {saving ? (
              <Spinner size="sm" className="text-black" />
            ) : (
              <Save size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
            )}
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            className="flex shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground min-h-11 min-w-11 outline-none"
            aria-label="More actions"
          >
            <MoreVertical size={18} strokeWidth={1.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            <DropdownMenuItem onClick={() => setPaletteOpen(true)}>Commands…</DropdownMenuItem>
            {canBlogAi && mobileTab === 'edit' && (
              <DropdownMenuItem onClick={() => setQuickDraftOpen(true)}>Quick draft…</DropdownMenuItem>
            )}
            {!frontmatter.draft && (
              <DropdownMenuItem
                onClick={() => void handleSave(true)}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Unpublish'}
              </DropdownMenuItem>
            )}
            {isSuperuser && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={deleting}
                >
                  Delete post…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Header — desktop */}
      <header className="hidden sm:flex items-center gap-3 border-b border-white/10 px-4 py-2.5 shrink-0">
        <Link
          href="/blog"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
        >
          <ArrowLeft size={13} />
          Posts
        </Link>
        <span className="text-white/20">|</span>
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm tracking-wide text-foreground">
          <span className="min-w-0 truncate">{frontmatter.title || displaySlug}</span>
          {draftTitleBadge}
          {isDirty && <span className="shrink-0 text-muted-foreground text-xs">•</span>}
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

        {canBlogAi && (
          <button
            type="button"
            onClick={() => setQuickDraftOpen(true)}
            title="Turn notes into a draft at the cursor"
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
          >
            <NotebookPen size={12} aria-hidden />
            Quick draft
          </button>
        )}

        {/* Command palette */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden sm:flex items-center shrink-0 gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
          title="Open command palette"
        >
          <span className="inline-flex items-center gap-2">
            Commands
            <span className="inline-flex items-center gap-1 opacity-40 pointer-events-none">
              <KbdGroup>
                <Kbd className="text-[10px] h-4 px-1">{isMac ? '⌘' : 'Ctrl'}</Kbd>
                <Kbd className="text-[10px] h-4 px-1">P</Kbd>
              </KbdGroup>
            </span>
          </span>
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {frontmatter.draft ? (
            <>
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs tracking-wide text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Spinner size="sm" />
                ) : (
                  <Save size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
                )}
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={saving}
                className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium tracking-wide text-black hover:bg-white disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Publish'}
              </button>
            </>
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
                className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium tracking-wide text-black hover:bg-white disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Spinner size="sm" className="text-black" />
                ) : (
                  <Save size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
                )}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}

          {isSuperuser && (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleting}
              title="Delete post (superuser only)"
              className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              {deleting ? <Spinner size="sm" /> : <Trash2 size={14} />}
            </button>
          )}
        </div>
      </header>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="text-foreground font-medium">{frontmatter.title || slug}</span> from GitHub. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { setDeleteConfirmOpen(false); void handleDelete() }}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium tracking-wide text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Delete
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {/* Mobile: section tabs — top only (dashboard already has bottom nav) */}
        <nav
          className="sm:hidden shrink-0 border-b border-white/10 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80"
          aria-label="Editor section"
        >
          <div className="flex items-stretch justify-around px-1 py-2">
            {mobileTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMobileTab(id)}
                className={[
                  'flex min-h-11 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 px-1.5 py-2 transition-colors rounded-lg',
                  mobileTab === id
                    ? 'bg-white/10 text-foreground'
                    : 'text-muted-foreground active:bg-white/5',
                ].join(' ')}
              >
                <Icon size={22} strokeWidth={1.5} className="shrink-0" />
                <span className="min-w-0 truncate text-[11px] font-medium tracking-widest">{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Mobile: active panel — bottom padding clears dashboard MobileTabBar only */}
        <div className="sm:hidden flex-1 min-h-0 overflow-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
          {mobileTab === 'attributes' && (
            <FrontmatterPanel data={frontmatter} onChange={handleFrontmatterChange} onInsertImage={handleInsertImageAsset} />
          )}
          {mobileTab === 'edit' && (
            <MarkdownEditor
              ref={markdownEditorRef}
              value={bodyMarkdown}
              onChange={handleBodyChange}
              onImageUpload={handleImageUpload}
              onSelectionChange={canBlogAi ? bumpAiSelection : undefined}
            />
          )}
          {mobileTab === 'preview' && <BlogPreview markdown={bodyMarkdown} />}
        </div>

        {/* Desktop: resizable panels */}
        <div className="hidden sm:block flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" className="h-full">
            {/* Frontmatter sidebar */}
            <Panel defaultSize={24} minSize={20} maxSize={40} className="border-r border-white/10">
              <FrontmatterPanel data={frontmatter} onChange={handleFrontmatterChange} onInsertImage={handleInsertImageAsset} />
            </Panel>

            <PanelResizeHandle className="w-2 bg-white/5 hover:bg-white/15 transition-colors data-[resize-handle-state=drag]:bg-white/20" />

            {/* Editor */}
            <Panel defaultSize={showPreview ? 38 : 76} minSize={15}>
              <div className="flex h-full flex-col">
                {editorMode === 'raw' ? (
                  <MarkdownEditor
                    ref={markdownEditorRef}
                    value={bodyMarkdown}
                    onChange={handleBodyChange}
                    onImageUpload={handleImageUpload}
                    onSelectionChange={canBlogAi ? bumpAiSelection : undefined}
                  />
                ) : (
                  <VisualEditor
                    ref={visualEditorRef}
                    value={bodyMarkdown}
                    onChange={handleBodyChange}
                    onImageUpload={handleImageUpload}
                    onSelectionChange={canBlogAi ? bumpAiSelection : undefined}
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

      {canBlogAi && (
        <BlogAiAssistLayer
          enabled
          selectionRevision={aiSelRevision}
          getEditor={getActiveAiEditor}
          formatActions={selectionFormatActions}
          onFormatApplied={bumpAiSelection}
          onAiActionComplete={bumpAiSelection}
        />
      )}

      {canBlogAi && (
        <BlogQuickDraftDialog
          open={quickDraftOpen}
          onOpenChange={setQuickDraftOpen}
          onInsert={handleQuickDraftInsert}
        />
      )}

      <CommandDialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        title="Blog editor command palette"
        description="Search and run editor commands"
      >
        <Command>
          <CommandInput placeholder="Search commands..." />
          <CommandList>
            <CommandEmpty>No commands found.</CommandEmpty>

            <CommandGroup heading="Post">
              <CommandItem
                onSelect={() => {
                  closePalette()
                  router.push('/blog')
                }}
              >
                <span>Back to posts</span>
              </CommandItem>
            </CommandGroup>

            {isDesktop && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Editor mode">
                  <CommandItem
                    onSelect={() => {
                      setEditorMode('raw')
                      closePalette()
                    }}
                  >
                    <span>Switch to Raw editor</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      setEditorMode('visual')
                      closePalette()
                    }}
                  >
                    <span>Switch to Visual editor</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {isDesktop && (
              <>
                <CommandSeparator />
                <CommandGroup heading="View">
                  <CommandItem
                    onSelect={() => {
                      setShowPreview((v) => !v)
                      closePalette()
                    }}
                  >
                    <span>{showPreview ? 'Hide preview panel' : 'Show preview panel'}</span>
                  </CommandItem>
                  {editorMode === 'raw' && (
                    <CommandItem
                      onSelect={() => {
                        markdownEditorRef.current?.toggleWordWrap()
                        closePalette()
                      }}
                    >
                      <span>Toggle word wrap</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}

            {canBlogAi && (isDesktop || mobileTab === 'edit') && (
              <>
                <CommandSeparator />
                <CommandGroup heading="AI">
                  <CommandItem
                    onSelect={() => {
                      setQuickDraftOpen(true)
                      closePalette()
                    }}
                  >
                    <span>Quick draft…</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {!isDesktop && (
              <>
                <CommandSeparator />
                <CommandGroup heading="View">
                  <CommandItem
                    onSelect={() => {
                      setMobileTab('attributes')
                      closePalette()
                    }}
                  >
                    <span>Go to Attributes</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      setMobileTab('edit')
                      closePalette()
                    }}
                  >
                    <span>Go to Edit</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      setMobileTab('preview')
                      closePalette()
                    }}
                  >
                    <span>Go to Preview</span>
                  </CommandItem>
                  {mobileTab === 'edit' && (
                    <CommandItem
                      onSelect={() => {
                        markdownEditorRef.current?.toggleWordWrap()
                        closePalette()
                      }}
                    >
                      <span>Toggle word wrap</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}

            <CommandSeparator />
            <CommandGroup heading="Frontmatter">
              <CommandItem
                onSelect={() => {
                  handleFrontmatterChange({ draft: !frontmatter.draft })
                  closePalette()
                }}
              >
                <span>{frontmatter.draft ? 'Mark as published (draft off)' : 'Mark as draft'}</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup heading="Publish">
              {frontmatter.draft ? (
                <CommandItem
                  disabled={saving}
                  onSelect={() => {
                    closePalette()
                    void handleSave(false)
                  }}
                >
                  <span>Publish</span>
                </CommandItem>
              ) : (
                <>
                  <CommandItem
                    disabled={saving}
                    onSelect={() => {
                      closePalette()
                      void handleSave(true)
                    }}
                  >
                    <span>Unpublish (save as draft)</span>
                  </CommandItem>
                  <CommandItem
                    disabled={saving}
                    onSelect={() => {
                      closePalette()
                      void handleSave()
                    }}
                  >
                    <span>Save</span>
                  </CommandItem>
                </>
              )}
            </CommandGroup>

            {isSuperuser && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Danger">
                  <CommandItem
                    disabled={deleting}
                    onSelect={() => {
                      setDeleteConfirmOpen(true)
                      closePalette()
                    }}
                  >
                    <span>Delete post…</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            <CommandSeparator />
            <CommandGroup heading="Insert">
              <CommandItem
                disabled={!canUseRawImage}
                onSelect={() => {
                  markdownEditorRef.current?.openImagePicker()
                  closePalette()
                }}
              >
                <span>Insert image (raw editor)</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualImage}
                onSelect={() => {
                  visualEditorRef.current?.openImagePicker()
                  closePalette()
                }}
              >
                <span>Insert image (visual editor)</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup heading="Format (visual)">
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.toggleBold())
                }}
              >
                <span>Bold</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.toggleItalic())
                }}
              >
                <span>Italic</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.toggleStrike())
                }}
              >
                <span>Strikethrough</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.toggleCode())
                }}
              >
                <span>Inline code</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.toggleHeading1())
                }}
              >
                <span>Heading 1</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.toggleHeading2())
                }}
              >
                <span>Heading 2</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.toggleHeading3())
                }}
              >
                <span>Heading 3</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.toggleBulletList())
                }}
              >
                <span>Bullet list</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.toggleOrderedList())
                }}
              >
                <span>Ordered list</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.toggleBlockquote())
                }}
              >
                <span>Blockquote</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.toggleCodeBlock())
                }}
              >
                <span>Code block</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.setHorizontalRule())
                }}
              >
                <span>Horizontal rule</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.openLinkDialog())
                }}
              >
                <span>Link…</span>
              </CommandItem>
              <CommandItem
                disabled={!canUseVisualFormatting}
                onSelect={() => {
                  closePalette()
                  runVisual((api) => api.openTableDialog())
                }}
              >
                <span>Table…</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  )
}
