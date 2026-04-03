'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  Bold,
  CheckSquare,
  ChevronUp,
  Code,
  FoldHorizontal,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Languages,
  Link,
  Sparkles,
  Strikethrough,
  UnfoldHorizontal,
  Wand2,
} from 'lucide-react'
import {
  blogAiAssistCreateImage,
  blogAiAssistRequest,
  consumeBlogAiTextStream,
  type BlogAiAssistAction,
} from '@/lib/blog-ai-api'
import type { MarkdownEditorHandle } from '@/components/blog/MarkdownEditor'
import { roundedRectPathD, roundedRectPerimeter } from '@/lib/blog-ai-glow-path'
import { computeToolbarPosition } from '@/lib/blog-selection-toolbar-position'
import { BLOG_TRANSLATE_LANGUAGE_OPTIONS } from '@/lib/blog-translate-languages'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

export type BlogAiEditorHandle = Pick<
  MarkdownEditorHandle,
  | 'getSelectionMeta'
  | 'getSelectionRect'
  | 'getSelectionRects'
  | 'replaceSelection'
  | 'insertAfterSelection'
>

export type BlogSelectionFormatActions = {
  bold: () => void
  italic: () => void
  code: () => void
  strike: () => void
  link: () => void
  heading1: () => void
  heading2: () => void
}

function escapeMdAlt(alt: string): string {
  return alt.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
}

function BlogAiGlowSegment({ rect, glowPad }: { rect: DOMRect; glowPad: number }) {
  const w = rect.width + glowPad * 2
  const h = rect.height + glowPad * 2
  const r = Math.min(10, w / 2, h / 2)
  const P = roundedRectPerimeter(w, h, r)
  const seg = Math.max(6, P * 0.16)
  const gap = Math.max(0, P - seg)
  const d = roundedRectPathD(w, h, r)
  const durSec = Math.max(1.2, Math.min(5, P / 80))
  return (
    <div
      className="blog-ai-glow-root"
      style={{
        left: rect.left - glowPad,
        top: rect.top - glowPad,
        width: w,
        height: h,
        borderRadius: r,
      }}
      aria-hidden
    >
      <div className="blog-ai-glow-soft" style={{ borderRadius: r }} />
      <svg
        className="blog-ai-glow-snake-svg"
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <path
          className="blog-ai-snake-dash"
          d={d}
          fill="none"
          style={{
            ['--blog-ai-p' as string]: String(P),
            strokeDasharray: `${seg} ${gap}`,
            animationDuration: `${durSec}s`,
          }}
        />
      </svg>
    </div>
  )
}

interface Props {
  enabled: boolean
  /** Increment when selection or scroll may change rect. */
  selectionRevision: number
  getEditor: () => BlogAiEditorHandle | null
  formatActions: BlogSelectionFormatActions
  /** Called after a formatting action so selection rects refresh. */
  onFormatApplied?: () => void
  /** Called after an AI action finishes so the parent can refresh selection rects. */
  onAiActionComplete?: () => void
}

export function BlogAiAssistLayer({
  enabled,
  selectionRevision,
  getEditor,
  formatActions,
  onFormatApplied,
  onAiActionComplete,
}: Props) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [floatingPos, setFloatingPos] = useState<{ left: number; top: number } | null>(null)
  const [glowRects, setGlowRects] = useState<DOMRect[] | null>(null)
  const [flashRect, setFlashRect] = useState<DOMRect | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false)
  const [translateLang, setTranslateLang] = useState(BLOG_TRANSLATE_LANGUAGE_OPTIONS[0].value)
  const translateSourceRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const getEditorRef = useRef(getEditor)
  getEditorRef.current = getEditor
  const toolbarRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!enabled) {
      setAnchorRect(null)
      return
    }
    const ed = getEditorRef.current()
    if (!ed) {
      setAnchorRect(null)
      return
    }
    const meta = ed.getSelectionMeta()
    if (!meta || meta.inCodeBlock || !meta.text.trim()) {
      setAnchorRect(null)
      return
    }
    const rect = ed.getSelectionRect()
    if (!rect || rect.width < 1) {
      setAnchorRect(null)
      return
    }
    setAnchorRect(rect)
  }, [enabled, selectionRevision])

  useLayoutEffect(() => {
    if (!anchorRect || loading) {
      setFloatingPos(null)
      return
    }
    const estimate = { w: 400, h: 48 }
    setFloatingPos(computeToolbarPosition(anchorRect, estimate))
    const id = requestAnimationFrame(() => {
      const el = toolbarRef.current
      if (!el || !anchorRect) return
      setFloatingPos(computeToolbarPosition(anchorRect, { w: el.offsetWidth, h: el.offsetHeight }))
    })
    return () => cancelAnimationFrame(id)
  }, [anchorRect, loading, selectionRevision])

  const runAction = useCallback(async (action: BlogAiAssistAction) => {
    const ed = getEditorRef.current()
    if (!ed) return
    const meta = ed.getSelectionMeta()
    if (!meta || meta.inCodeBlock || !meta.text.trim()) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const lineRects = ed.getSelectionRects()
    const merged = ed.getSelectionRect()
    setGlowRects(lineRects.length > 0 ? lineRects : merged ? [merged] : [])
    setLoading(true)

    try {
      if (action === 'createImage') {
        const { url, alt } = await blogAiAssistCreateImage(meta.text, ac.signal)
        const safeAlt = escapeMdAlt(alt || 'Illustration')
        ed.insertAfterSelection(`\n\n![${safeAlt}](${url})\n`)
        const fr = ed.getSelectionRect()
        if (fr) setFlashRect(fr)
        setTimeout(() => setFlashRect(null), 700)
        toast.success('Image inserted')
      } else {
        const res = await blogAiAssistRequest(action, meta.text, { signal: ac.signal })
        const text = await consumeBlogAiTextStream(res, () => {
          /* streaming progress optional */
        })
        if (!text.trim()) {
          toast.error('No response from the model')
          return
        }
        ed.replaceSelection(text)
        const fr = ed.getSelectionRect()
        if (fr) setFlashRect(fr)
        setTimeout(() => setFlashRect(null), 700)
        toast.success('Updated')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error(err instanceof Error ? err.message : 'AI request failed')
    } finally {
      setLoading(false)
      setGlowRects(null)
      setAiMenuOpen(false)
      abortRef.current = null
      onAiActionComplete?.()
    }
  }, [onAiActionComplete])

  const openTranslateDialog = useCallback(() => {
    const ed = getEditorRef.current()
    const meta = ed?.getSelectionMeta()
    if (!meta?.text.trim()) return
    translateSourceRef.current = meta.text
    setAiMenuOpen(false)
    setTranslateDialogOpen(true)
  }, [])

  const onTranslateDialogOpenChange = useCallback((open: boolean) => {
    setTranslateDialogOpen(open)
    if (!open) translateSourceRef.current = null
  }, [])

  const runTranslate = useCallback(async () => {
    const text = translateSourceRef.current?.trim()
    if (!text) {
      toast.error('Nothing to translate')
      return
    }
    const targetLanguage = translateLang.trim()
    if (!targetLanguage) return

    const ed = getEditorRef.current()
    if (!ed) return

    setTranslateDialogOpen(false)

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const lineRects = ed.getSelectionRects()
    const merged = ed.getSelectionRect()
    setGlowRects(lineRects.length > 0 ? lineRects : merged ? [merged] : [])
    setLoading(true)

    try {
      const res = await blogAiAssistRequest('translate', text, {
        targetLanguage,
        signal: ac.signal,
      })
      const out = await consumeBlogAiTextStream(res, () => {
        /* streaming progress optional */
      })
      if (!out.trim()) {
        toast.error('No response from the model')
        return
      }
      ed.replaceSelection(out)
      const fr = ed.getSelectionRect()
      if (fr) setFlashRect(fr)
      setTimeout(() => setFlashRect(null), 700)
      toast.success('Translated')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error(err instanceof Error ? err.message : 'AI request failed')
    } finally {
      setLoading(false)
      setGlowRects(null)
      translateSourceRef.current = null
      abortRef.current = null
      onAiActionComplete?.()
    }
  }, [onAiActionComplete, translateLang])

  const applyFormat = useCallback(
    (fn: () => void) => {
      fn()
      onFormatApplied?.()
    },
    [onFormatApplied],
  )

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  if (!enabled || typeof document === 'undefined') return null

  const glowPad = 12
  let glowEl: ReactNode = null
  if (glowRects && glowRects.length > 0) {
    glowEl = createPortal(
      <>
        {glowRects.map((glowRect, i) => (
          <BlogAiGlowSegment key={i} rect={glowRect} glowPad={glowPad} />
        ))}
      </>,
      document.body,
    )
  }

  const flashEl =
    flashRect &&
    createPortal(
      <div
        className="blog-ai-insert-flash"
        style={{
          left: flashRect.left - 2,
          top: flashRect.top - 2,
          width: flashRect.width + 4,
          height: flashRect.height + 4,
        }}
        aria-hidden
      />,
      document.body,
    )

  const glassToolbar = cn(
    'pointer-events-auto relative overflow-hidden rounded-xl border border-white/[0.14]',
    'bg-neutral-950/45 shadow-[0_10px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14)]',
    'backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/[0.06]',
    'ring-1 ring-white/10',
  )

  const glassAiPanel = cn(
    'flex flex-col gap-0.5 rounded-xl border border-white/[0.14] p-1',
    'bg-neutral-950/50 shadow-[0_-16px_48px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.12)]',
    'backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/[0.07]',
    'ring-1 ring-white/10',
  )

  const toolbarEl =
    anchorRect &&
    !loading &&
    floatingPos &&
    createPortal(
      <div
        ref={toolbarRef}
        className={cn(
          glassToolbar,
          'fixed z-[100] flex w-max max-w-[min(100vw-16px,540px)] flex-nowrap items-center gap-1 px-1.5 py-1 text-sm text-popover-foreground outline-hidden',
        )}
        style={{
          left: floatingPos.left,
          top: floatingPos.top,
          transform: 'translateX(-50%)',
        }}
        role="toolbar"
        aria-label="Selection tools"
      >
        <Popover open={aiMenuOpen} onOpenChange={setAiMenuOpen}>
          <PopoverTrigger
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-sky-100/95',
              'hover:bg-white/12',
              aiMenuOpen &&
                'bg-sky-500/30 text-white shadow-[inset_0_0_0_1px_rgba(56,189,248,0.45)]',
            )}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Sparkles className="size-3.5 shrink-0 opacity-90" aria-hidden />
            <span>AI</span>
            <ChevronUp
              className={cn('size-3.5 shrink-0 opacity-80 transition-transform', aiMenuOpen && 'rotate-180')}
              aria-hidden
            />
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={10}
            alignOffset={-4}
            positionerClassName="z-[100]"
            className={cn(
              glassAiPanel,
              'z-[100] w-[min(100vw-24px,17.5rem)] origin-bottom gap-0.5 p-1 text-sm text-zinc-100',
            )}
          >
            <AiMenuTextRow
              label="Expand"
              icon={<UnfoldHorizontal className="size-3.5 shrink-0 opacity-80" aria-hidden />}
              onClick={() => void runAction('expand')}
            />
            <AiMenuTextRow
              label="Rephrase"
              icon={<Wand2 className="size-3.5 shrink-0 opacity-80" aria-hidden />}
              onClick={() => void runAction('rephrase')}
            />
            <AiMenuTextRow
              label="Proofread"
              icon={<CheckSquare className="size-3.5 shrink-0 opacity-80" aria-hidden />}
              onClick={() => void runAction('proofread')}
            />
            <AiMenuTextRow
              label="Condense"
              icon={<FoldHorizontal className="size-3.5 shrink-0 opacity-80" aria-hidden />}
              onClick={() => void runAction('condense')}
            />
            <AiMenuTextRow
              label="Translate…"
              icon={<Languages className="size-3.5 shrink-0 opacity-80" aria-hidden />}
              onClick={openTranslateDialog}
            />
            <Separator className="my-0.5 bg-white/10" />
            <AiMenuTextRow
              label="Create image"
              icon={<ImagePlus className="size-3.5 shrink-0 opacity-80" aria-hidden />}
              onClick={() => void runAction('createImage')}
            />
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-7 bg-white/15" />

        <div className="flex flex-nowrap items-center gap-0.5">
          <FormatIconButton
            label="Bold"
            onClick={() => applyFormat(formatActions.bold)}
            icon={<Bold size={16} />}
          />
          <FormatIconButton
            label="Italic"
            onClick={() => applyFormat(formatActions.italic)}
            icon={<Italic size={16} />}
          />
          <FormatIconButton
            label="Code"
            onClick={() => applyFormat(formatActions.code)}
            icon={<Code size={16} />}
          />
          <FormatIconButton
            label="Link"
            onClick={() => applyFormat(formatActions.link)}
            icon={<Link size={16} />}
          />
          <FormatIconButton
            label="Heading 1"
            onClick={() => applyFormat(formatActions.heading1)}
            icon={<Heading1 size={16} />}
          />
          <FormatIconButton
            label="Heading 2"
            onClick={() => applyFormat(formatActions.heading2)}
            icon={<Heading2 size={16} />}
          />
          <FormatIconButton
            label="Strikethrough"
            onClick={() => applyFormat(formatActions.strike)}
            icon={<Strikethrough size={16} />}
          />
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      {glowEl}
      {flashEl}
      {toolbarEl}
      <Dialog open={translateDialogOpen} onOpenChange={onTranslateDialogOpenChange}>
        <DialogContent overlayClassName="z-[110]" className="z-[110] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Translate selection</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="blog-translate-lang">Target language</Label>
              <select
                id="blog-translate-lang"
                value={translateLang}
                onChange={(e) => setTranslateLang(e.target.value)}
                className="flex h-9 w-full rounded-md border border-white/10 bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {BLOG_TRANSLATE_LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setTranslateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void runTranslate()}>
                Translate
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function FormatIconButton({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={label}
      className="rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
    >
      {icon}
    </Button>
  )
}

function AiMenuTextRow({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-normal',
        'text-zinc-100/95 transition-colors',
        'hover:bg-white/[0.12] focus-visible:bg-white/[0.12] focus-visible:outline-none',
        'active:bg-white/[0.16]',
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  )
}
