'use client'

import {
  useCallback,
  useEffect,
  useId,
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
import { BLOG_AI_MAX_INPUT_CHARS } from '@/lib/blog-ai-assist-limits'
import type { MarkdownEditorHandle } from '@/components/blog/MarkdownEditor'
import {
  roundedRectInnerMetrics,
  roundedRectPathD,
  roundedRectPerimeter,
} from '@/lib/blog-ai-glow-path'
import { mergeDomRects } from '@/lib/blog-editor-ai-types'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

export interface BlogAiEditorHandle {
  getSelectionMeta: () => import('@/lib/blog-editor-ai-types').BlogEditorSelectionMeta | null
  getSelectionRect: () => DOMRect | null
  getSelectionRects: () => DOMRect[]
  isAllSelected: () => boolean
  getEditorContainerRect: () => DOMRect | null
  replaceSelection: (text: string, from?: number, to?: number) => void
  insertAfterSelection: (markdown: string, at?: number) => void
}

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

function clipRectToViewport(rect: DOMRect): DOMRect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.max(rect.left, 0)
  const top = Math.max(rect.top, 0)
  const right = Math.min(rect.right, vw)
  const bottom = Math.min(rect.bottom, vh)
  if (right - left < 1 || bottom - top < 1) return rect
  return new DOMRect(left, top, right - left, bottom - top)
}

/** Single merged bounds for one Siri-style perimeter glow (not per line).
 *  When the whole document is selected, uses the editor container rect instead of
 *  the text-content rect so the trail follows the editor edges. */
function selectionGlowBounds(ed: BlogAiEditorHandle): DOMRect | null {
  if (ed.isAllSelected()) {
    const editorRect = ed.getEditorContainerRect()
    if (editorRect && editorRect.width >= 1 && editorRect.height >= 1) {
      return clipRectToViewport(editorRect)
    }
  }
  const lineRects = ed.getSelectionRects()
  if (lineRects.length > 0) {
    const merged = mergeDomRects(lineRects)
    if (merged && merged.width >= 1 && merged.height >= 1) {
      return clipRectToViewport(merged)
    }
  }
  const fallback = ed.getSelectionRect()
  if (fallback && fallback.width >= 1 && fallback.height >= 1) {
    return clipRectToViewport(fallback)
  }
  return null
}

const BLOG_AI_GLOW_PATH_INSET = 0.75
/** ~one line of text; larger P → longer visible arc along perimeter */
const BLOG_AI_SNAKE_PERIMETER_REF = 900

/** Perimeter trail: solid line + blurred white sweep; dash length scales with selection size. */
function BlogAiGlowSegment({ rect, glowPad }: { rect: DOMRect; glowPad: number }) {
  const idSuffix = useId().replace(/:/g, '')
  const filterTrailId = `blog-ai-glow-trail-${idSuffix}`
  const filterHeadId = `blog-ai-glow-head-${idSuffix}`
  const clipId = `blog-ai-glow-inward-${idSuffix}`

  const w = rect.width + glowPad * 2
  const h = rect.height + glowPad * 2
  const r = Math.min(12, w / 2, h / 2)
  const minDim = Math.min(w, h)
  if (w < 2 || h < 2) {
    return null
  }

  const pathD = roundedRectPathD(w, h, r, BLOG_AI_GLOW_PATH_INSET)
  const { w: iw, h: ih, r: ir } = roundedRectInnerMetrics(w, h, r, BLOG_AI_GLOW_PATH_INSET)
  const P = roundedRectPerimeter(iw, ih, ir)

  const t = Math.min(P / BLOG_AI_SNAKE_PERIMETER_REF, 1)
  const snakeFrac = Math.min(
    0.46,
    Math.max(0.16, 0.18 + 0.28 * t + 0.06 * Math.min(minDim / 200, 1)),
  )
  const dashDraw = snakeFrac * P
  const dashGap = P - dashDraw
  const dashArray = `${dashDraw} ${dashGap}`

  if (!pathD || P < 4) {
    return null
  }

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
      <svg
        className="blog-ai-glow-snake-svg"
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height="100%"
        aria-hidden
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={w} height={h} rx={r} ry={r} />
          </clipPath>
          <filter id={filterTrailId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feComponentTransfer in="blur" result="boosted">
              <feFuncR type="linear" slope="1.4" intercept="0" />
              <feFuncG type="linear" slope="1.4" intercept="0" />
              <feFuncB type="linear" slope="1.4" intercept="0" />
              <feFuncA type="linear" slope="1.4" intercept="0" />
            </feComponentTransfer>
          </filter>
          <filter id={filterHeadId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feComponentTransfer in="blur" result="boosted">
              <feFuncR type="linear" slope="1.5" intercept="0" />
              <feFuncG type="linear" slope="1.5" intercept="0" />
              <feFuncB type="linear" slope="1.5" intercept="0" />
              <feFuncA type="linear" slope="1.5" intercept="0" />
            </feComponentTransfer>
          </filter>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <path
            d={pathD}
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={1.15}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray}
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to={-P}
              dur="1.4s"
              repeatCount="indefinite"
            />
          </path>
        </g>
        <g className="blog-ai-glow-trail-pulse" clipPath={`url(#${clipId})`}>
          <path
            d={pathD}
            fill="none"
            stroke="#ffffff"
            strokeWidth={5.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray}
            filter={`url(#${filterTrailId})`}
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to={-P}
              dur="1.4s"
              repeatCount="indefinite"
            />
          </path>
          <path
            d={pathD}
            fill="none"
            stroke="#ffffff"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray}
            filter={`url(#${filterHeadId})`}
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to={-P}
              dur="1.4s"
              repeatCount="indefinite"
            />
          </path>
        </g>
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
  /** Called when the AI loading state changes — used to freeze the editor. */
  onLoadingChange?: (loading: boolean) => void
}

const AI_TIMEOUT_MS = 10_000
const AI_IMAGE_TIMEOUT_MS = 30_000

/** Returns a signal that aborts after `ms` ms, or immediately when `parent` aborts. */
function makeTimeoutSignal(
  parent: AbortSignal,
  ms: number,
): [AbortSignal, () => void] {
  const ctrl = new AbortController()
  if (parent.aborted) {
    ctrl.abort(new DOMException('Aborted', 'AbortError'))
    return [ctrl.signal, () => {}]
  }
  const id = setTimeout(
    () => ctrl.abort(new DOMException('signal timed out', 'TimeoutError')),
    ms,
  )
  const onParentAbort = () => {
    clearTimeout(id)
    ctrl.abort(new DOMException('Aborted', 'AbortError'))
  }
  parent.addEventListener('abort', onParentAbort, { once: true })
  const clear = () => {
    clearTimeout(id)
    parent.removeEventListener('abort', onParentAbort)
  }
  return [ctrl.signal, clear]
}

export function BlogAiAssistLayer({
  enabled,
  selectionRevision,
  getEditor,
  formatActions,
  onFormatApplied,
  onAiActionComplete,
  onLoadingChange,
}: Props) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [floatingPos, setFloatingPos] = useState<{ left: number; top: number } | null>(null)
  const [glowRects, setGlowRects] = useState<DOMRect[] | null>(null)
  const [flashRect, setFlashRect] = useState<DOMRect | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false)
  const [translateLang, setTranslateLang] = useState(BLOG_TRANSLATE_LANGUAGE_OPTIONS[0].value)
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [imagePromptText, setImagePromptText] = useState('')
  const [imageModel, setImageModel] = useState<'grok' | 'gemini'>('grok')
  const translateSourceRef = useRef<string | null>(null)
  const translateFromRef = useRef<number | null>(null)
  const translateToRef = useRef<number | null>(null)
  const imageGlowBoundsRef = useRef<DOMRect | null>(null)
  const imageSelToRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const getEditorRef = useRef(getEditor)
  getEditorRef.current = getEditor
  const toolbarRef = useRef<HTMLDivElement>(null)

  const setLoadingState = useCallback((val: boolean) => {
    setLoading(val)
    onLoadingChange?.(val)
  }, [onLoadingChange])

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
    if (meta.text.length > BLOG_AI_MAX_INPUT_CHARS[action]) return

    // Capture positions before deselect / async gap
    const selFrom = meta.from
    const selTo = meta.to

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const bounds = selectionGlowBounds(ed)
    setGlowRects(bounds ? [bounds] : [])
    setLoadingState(true)
    // Deselect text so selection highlight doesn't show through the glow animation
    window.getSelection()?.removeAllRanges()

    try {
      const res0 = await blogAiAssistRequest(action, meta.text, { signal: (() => { const [s] = makeTimeoutSignal(ac.signal, AI_TIMEOUT_MS); return s })() })
      const text = await consumeBlogAiTextStream(res0, () => {})
      if (!text.trim()) return
      ed.replaceSelection(text, selFrom, selTo)
      const fr = ed.getSelectionRect()
      if (fr) setFlashRect(fr)
      setTimeout(() => setFlashRect(null), 700)
    } catch (firstErr) {
      if (firstErr instanceof Error && firstErr.name === 'AbortError') return
      if (firstErr instanceof DOMException && firstErr.name === 'TimeoutError') {
        if (ac.signal.aborted) return
        const toastId = toast.loading('Hang on…')
        try {
          const [sig, clearSig] = makeTimeoutSignal(ac.signal, AI_TIMEOUT_MS)
          const res1 = await blogAiAssistRequest(action, meta.text, { signal: sig })
          const text = await consumeBlogAiTextStream(res1, () => {})
          clearSig()
          toast.dismiss(toastId)
          if (!text.trim()) return
          ed.replaceSelection(text, selFrom, selTo)
          const fr = ed.getSelectionRect()
          if (fr) setFlashRect(fr)
          setTimeout(() => setFlashRect(null), 700)
        } catch {
          toast.dismiss(toastId)
          // second failure → silent, no edit
        }
        return
      }
      toast.error(firstErr instanceof Error ? firstErr.message : 'AI request failed')
    } finally {
      setLoadingState(false)
      setGlowRects(null)
      setAiMenuOpen(false)
      abortRef.current = null
      onAiActionComplete?.()
    }
  }, [onAiActionComplete, setLoadingState])

  const openTranslateDialog = useCallback(() => {
    const ed = getEditorRef.current()
    const meta = ed?.getSelectionMeta()
    if (!meta?.text.trim()) return
    translateSourceRef.current = meta.text
    translateFromRef.current = meta.from
    translateToRef.current = meta.to
    setAiMenuOpen(false)
    setTranslateDialogOpen(true)
  }, [])

  const onTranslateDialogOpenChange = useCallback((open: boolean) => {
    setTranslateDialogOpen(open)
    if (!open) {
      translateSourceRef.current = null
      translateFromRef.current = null
      translateToRef.current = null
    }
  }, [])

  const runTranslate = useCallback(async () => {
    const text = translateSourceRef.current?.trim()
    if (!text) {
      toast.error('Nothing to translate')
      return
    }
    const targetLanguage = translateLang.trim()
    if (!targetLanguage) return
    const selFrom = translateFromRef.current
    const selTo = translateToRef.current

    const ed = getEditorRef.current()
    if (!ed) return

    setTranslateDialogOpen(false)

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const bounds = selectionGlowBounds(ed)
    setGlowRects(bounds ? [bounds] : [])
    setLoadingState(true)
    window.getSelection()?.removeAllRanges()

    try {
      const [sig0, clear0] = makeTimeoutSignal(ac.signal, AI_TIMEOUT_MS)
      const res0 = await blogAiAssistRequest('translate', text, { targetLanguage, signal: sig0 })
      const out = await consumeBlogAiTextStream(res0, () => {})
      clear0()
      if (!out.trim()) return
      ed.replaceSelection(out, selFrom ?? undefined, selTo ?? undefined)
      const fr = ed.getSelectionRect()
      if (fr) setFlashRect(fr)
      setTimeout(() => setFlashRect(null), 700)
    } catch (firstErr) {
      if (firstErr instanceof Error && firstErr.name === 'AbortError') return
      if (firstErr instanceof DOMException && firstErr.name === 'TimeoutError') {
        if (ac.signal.aborted) return
        const toastId = toast.loading('Hang on…')
        try {
          const [sig1, clear1] = makeTimeoutSignal(ac.signal, AI_TIMEOUT_MS)
          const res1 = await blogAiAssistRequest('translate', text, { targetLanguage, signal: sig1 })
          const out = await consumeBlogAiTextStream(res1, () => {})
          clear1()
          toast.dismiss(toastId)
          if (!out.trim()) return
          ed.replaceSelection(out, selFrom ?? undefined, selTo ?? undefined)
          const fr = ed.getSelectionRect()
          if (fr) setFlashRect(fr)
          setTimeout(() => setFlashRect(null), 700)
        } catch {
          toast.dismiss(toastId)
        }
        return
      }
      toast.error(firstErr instanceof Error ? firstErr.message : 'AI request failed')
    } finally {
      setLoadingState(false)
      setGlowRects(null)
      translateSourceRef.current = null
      translateFromRef.current = null
      translateToRef.current = null
      abortRef.current = null
      onAiActionComplete?.()
    }
  }, [onAiActionComplete, translateLang, setLoadingState])

  const openImageDialog = useCallback(() => {
    const ed = getEditorRef.current()
    const meta = ed?.getSelectionMeta()
    if (!meta?.text.trim()) return
    imageGlowBoundsRef.current = selectionGlowBounds(ed!)
    imageSelToRef.current = meta.to
    setImagePromptText(meta.text)
    setImageModel('grok')
    setAiMenuOpen(false)
    setImageDialogOpen(true)
  }, [])

  const runImageCreate = useCallback(async () => {
    const ed = getEditorRef.current()
    if (!ed) return
    const prompt = imagePromptText.trim()
    if (!prompt) return
    const insertAt = imageSelToRef.current ?? undefined

    setImageDialogOpen(false)

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const bounds = imageGlowBoundsRef.current
    setGlowRects(bounds ? [bounds] : [])
    setLoadingState(true)
    window.getSelection()?.removeAllRanges()

    try {
      const doImageRequest = async (sig: AbortSignal) =>
        blogAiAssistCreateImage(prompt, imageModel === 'gemini', sig)

      let result: { url: string; alt: string }
      const [sig0, clear0] = makeTimeoutSignal(ac.signal, AI_IMAGE_TIMEOUT_MS)
      try {
        result = await doImageRequest(sig0)
        clear0()
      } catch (firstErr) {
        clear0()
        if (firstErr instanceof Error && firstErr.name === 'AbortError') return
        if (firstErr instanceof DOMException && firstErr.name === 'TimeoutError') {
          if (ac.signal.aborted) return
          const toastId = toast.loading('Hang on…')
          try {
            const [sig1, clear1] = makeTimeoutSignal(ac.signal, AI_IMAGE_TIMEOUT_MS)
            result = await doImageRequest(sig1)
            clear1()
            toast.dismiss(toastId)
          } catch {
            toast.dismiss(toastId)
            return
          }
        } else {
          throw firstErr
        }
      }

      if (!result!.url.trim()) return
      const safeAlt = escapeMdAlt(result!.alt.trim() || 'Illustration')
      let parsedUrl: URL
      try {
        parsedUrl = new URL(result!.url)
      } catch { return }
      if (parsedUrl.protocol !== 'https:') return
      if (!parsedUrl.hostname.endsWith('.supabase.co')) return
      ed.insertAfterSelection(`\n\n![${safeAlt}](${parsedUrl.href})\n`, insertAt)
      const fr = ed.getSelectionRect()
      if (fr) setFlashRect(fr)
      setTimeout(() => setFlashRect(null), 700)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error(err instanceof Error ? err.message : 'Image generation failed')
    } finally {
      setLoadingState(false)
      setGlowRects(null)
      imageGlowBoundsRef.current = null
      imageSelToRef.current = null
      abortRef.current = null
      onAiActionComplete?.()
    }
  }, [imagePromptText, imageModel, onAiActionComplete, setLoadingState])

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

  const glowPad = 2
  let glowEl: ReactNode = null
  const glowBounds = glowRects?.[0]
  if (glowBounds) {
    glowEl = createPortal(
      <BlogAiGlowSegment rect={glowBounds} glowPad={glowPad} />,
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
              'focus-visible:border-white/35 focus-visible:ring-3 focus-visible:ring-white/40',
              aiMenuOpen &&
                'bg-white/[0.1] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]',
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
              label="Create image from text"

              icon={<ImagePlus className="size-3.5 shrink-0 opacity-80" aria-hidden />}
              onClick={openImageDialog}
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
              <Select value={translateLang} onValueChange={(v) => { if (v) setTranslateLang(v) }}>
                <SelectTrigger id="blog-translate-lang" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOG_TRANSLATE_LANGUAGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* Image generation dialog */}
      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent overlayClassName="z-[110]" className="z-[110] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate image</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="blog-image-prompt">Image prompt</Label>
              <textarea
                id="blog-image-prompt"
                value={imagePromptText}
                onChange={(e) => setImagePromptText(e.target.value)}
                rows={4}
                className="flex w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 resize-none"
                placeholder="Describe the image you want to generate…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Select value={imageModel} onValueChange={(v) => setImageModel(v as 'grok' | 'gemini')}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) => v === 'gemini' ? 'Gemini — text rendering' : 'Grok'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grok">Grok</SelectItem>
                  <SelectItem value="gemini">Gemini — text rendering</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setImageDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void runImageCreate()} disabled={!imagePromptText.trim()}>
                Generate
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
