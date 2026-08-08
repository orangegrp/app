"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react"
import dynamic from "next/dynamic"
import { ChevronDown, Maximize2, Minimize2, X } from "lucide-react"
import { sendMail } from "@/lib/mail-api"
import { uploadBlogImage } from "@/lib/blog-api"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAuthStore } from "@/lib/auth-store"
import { PERMISSIONS } from "@/lib/permissions"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import {
  onMailComposerOpen,
  type MailComposerPrefill,
} from "@/lib/mail-composer-store"
import {
  BlogAiAssistLayer,
  type BlogAiEditorHandle,
  type BlogSelectionFormatActions,
} from "@/components/blog/BlogAiAssistLayer"
import type { VisualEditorHandle } from "@/components/blog/VisualEditor"

const VisualEditor = dynamic(
  () => import("@/components/blog/VisualEditor").then((m) => m.VisualEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center py-6">
        <Spinner size="sm" />
      </div>
    ),
  }
)

const DRAFT_KEY = "mail:composer:draft:v1"
const LAYOUT_KEY = "mail:composer:layout:v1"
const FONT_KEY = "mail:composer:font"
const DEFAULT_EXPANDED_WIDTH = 920
const MIN_EXPANDED_WIDTH = 620

type DraftState = { to: string; subject: string; body: string }
type LayoutState = { expandedWidth: number; horizontalOffset: number }
type FontKey = "sans" | "serif" | "mono"

const FONTS: Record<FontKey, { label: string; css: string }> = {
  sans: { label: "Sans-serif", css: "ui-sans-serif, system-ui, sans-serif" },
  serif: { label: "Serif", css: 'Georgia, "Times New Roman", serif' },
  mono: { label: "ui-monospace, Menlo, \"Courier New\", monospace", css: 'ui-monospace, Menlo, "Courier New", monospace' },
}
// Fix mono label
FONTS.mono = { label: "Monospace", css: 'ui-monospace, Menlo, "Courier New", monospace' }

function htmlToText(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, "")
  const div = document.createElement("div")
  div.innerHTML = html
  return div.textContent ?? div.innerText ?? ""
}

function loadDraft(): DraftState {
  if (typeof window === "undefined") return { to: "", subject: "", body: "" }
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return { to: "", subject: "", body: "" }
    const parsed = JSON.parse(raw) as Partial<DraftState>
    return {
      to: typeof parsed.to === "string" ? parsed.to : "",
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      body: typeof parsed.body === "string" ? parsed.body : "",
    }
  } catch {
    return { to: "", subject: "", body: "" }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function loadLayout(): LayoutState {
  if (typeof window === "undefined") return { expandedWidth: DEFAULT_EXPANDED_WIDTH, horizontalOffset: 0 }
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY)
    if (!raw) return { expandedWidth: DEFAULT_EXPANDED_WIDTH, horizontalOffset: 0 }
    const parsed = JSON.parse(raw) as Partial<LayoutState>
    return {
      expandedWidth:
        typeof parsed.expandedWidth === "number"
          ? clamp(parsed.expandedWidth, MIN_EXPANDED_WIDTH, 1200)
          : DEFAULT_EXPANDED_WIDTH,
      horizontalOffset:
        typeof parsed.horizontalOffset === "number"
          ? clamp(parsed.horizontalOffset, -1600, 0)
          : 0,
    }
  } catch {
    return { expandedWidth: DEFAULT_EXPANDED_WIDTH, horizontalOffset: 0 }
  }
}

function loadFont(): FontKey {
  try {
    const v = window.localStorage.getItem(FONT_KEY)
    if (v === "sans" || v === "serif" || v === "mono") return v
  } catch {}
  return "sans"
}

export function MailFloatingComposer() {
  const user = useAuthStore((s) => s.user)
  const isMobile = useIsMobile()

  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [expandedWidth, setExpandedWidth] = useState(DEFAULT_EXPANDED_WIDTH)
  const [horizontalOffset, setHorizontalOffset] = useState(0)
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [richText, setRichText] = useState(false)
  const [font, setFont] = useState<FontKey>("sans")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [selectionRevision, setSelectionRevision] = useState(0)
  const [aiLoading, setAiLoading] = useState(false)

  const editorRef = useRef<VisualEditorHandle>(null)
  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const bumpSelection = useCallback(() => setSelectionRevision((r) => r + 1), [])

  const hasMail =
    !!user &&
    (user.permissions === "*" ||
      user.permissions?.split(",").some((p) => p.trim() === PERMISSIONS.APP_MAIL))

  const canAi =
    !!user &&
    (user.permissions === "*" ||
      user.permissions?.split(",").some((p) => p.trim() === PERMISSIONS.APP_BLOG_AI))

  useEffect(() => {
    const draft = loadDraft()
    setTo(draft.to)
    setSubject(draft.subject)
    setBody(draft.body)

    const layout = loadLayout()
    setExpandedWidth(layout.expandedWidth)
    setHorizontalOffset(layout.horizontalOffset)

    setFont(loadFont())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ to, subject, body } satisfies DraftState))
  }, [to, subject, body])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ expandedWidth, horizontalOffset } satisfies LayoutState))
  }, [expandedWidth, horizontalOffset])

  useEffect(() => {
    const unsubscribe = onMailComposerOpen((prefill: MailComposerPrefill) => {
      setOpen(true)
      if (prefill.to && prefill.to.length > 0) setTo(prefill.to.join(", "))
      if (prefill.subject) setSubject(prefill.subject)
      if (prefill.body) setBody(prefill.body)
    })
    return unsubscribe
  }, [])

  function handleModeSwitch(toRichText: boolean) {
    if (!toRichText && richText) {
      // Strip HTML tags when switching back to plain text
      setBody(htmlToText(body))
    }
    setRichText(toRichText)
  }

  function handleFontChange(next: FontKey) {
    setFont(next)
    try { window.localStorage.setItem(FONT_KEY, next) } catch {}
  }

  const recipients = to.split(",").map((s) => s.trim()).filter(Boolean)

  async function handleImageUpload(file: File): Promise<string> {
    const { url } = await uploadBlogImage(file)
    return url
  }

  const formatActions: BlogSelectionFormatActions = {
    bold: () => editorRef.current?.toggleBold(),
    italic: () => editorRef.current?.toggleItalic(),
    code: () => editorRef.current?.toggleCode(),
    strike: () => editorRef.current?.toggleStrike(),
    link: () => editorRef.current?.openLinkDialog(),
    heading1: () => editorRef.current?.toggleHeading1(),
    heading2: () => editorRef.current?.toggleHeading2(),
  }

  const getEditor = useCallback(
    (): BlogAiEditorHandle | null => editorRef.current as unknown as BlogAiEditorHandle | null,
    []
  )

  async function send(demo: boolean) {
    setSending(true)
    setError(null)
    setInfo(null)
    try {
      const fontCss = FONTS[font].css
      const htmlBody = richText
        ? (font !== "sans" ? `<div style="font-family: ${fontCss}">${body}</div>` : body)
        : null
      const textBody = richText ? htmlToText(body) : body

      await sendMail({
        to: recipients,
        subject,
        text: textBody,
        html: htmlBody,
        demo,
      })
      setInfo(demo ? "Demo message saved locally." : "Message sent.")
      setSubject("")
      setBody("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed")
    } finally {
      setSending(false)
    }
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!expanded || isMobile) return
    dragRef.current = { startX: event.clientX, startOffset: horizontalOffset }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragRef.current || !expanded || isMobile) return
    const delta = event.clientX - dragRef.current.startX
    const viewportWidth = window.innerWidth
    const minOffset = -Math.max(0, viewportWidth - expandedWidth - 24)
    setHorizontalOffset(clamp(dragRef.current.startOffset + delta, minOffset, 0))
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragRef.current) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function beginResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!expanded || isMobile) return
    resizeRef.current = { startX: event.clientX, startWidth: expandedWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!resizeRef.current || !expanded || isMobile) return
    const delta = resizeRef.current.startX - event.clientX
    const maxWidth = Math.min(1200, window.innerWidth - 24)
    const nextWidth = clamp(resizeRef.current.startWidth + delta, MIN_EXPANDED_WIDTH, maxWidth)
    setExpandedWidth(nextWidth)
    setHorizontalOffset((prev) => clamp(prev, -Math.max(0, window.innerWidth - nextWidth - 24), 0))
  }

  function endResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!resizeRef.current) return
    resizeRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function toggleExpanded(): void {
    if (isMobile) { setExpanded(true); return }
    setExpanded((prev) => {
      if (!prev) {
        const maxWidth = Math.min(1200, window.innerWidth - 24)
        setExpandedWidth((width) => clamp(Math.max(width, DEFAULT_EXPANDED_WIDTH), MIN_EXPANDED_WIDTH, maxWidth))
      }
      return !prev
    })
  }

  if (!hasMail) return null
  if (!open) return null

  const expandedDesktop = expanded && !isMobile
  const containerStyle: CSSProperties | undefined = expandedDesktop
    ? { width: `${Math.round(expandedWidth)}px`, transform: `translateX(${Math.round(horizontalOffset)}px)` }
    : undefined

  const bodyMinHeight = expanded ? "min-h-[320px]" : "min-h-[160px]"

  return (
    <>
      <div
        className={[
          "fixed z-40 border border-white/10 bg-[oklch(0.08_0_0_/_92%)] backdrop-blur-xl",
          isMobile
            ? "inset-0 h-[100dvh] w-screen rounded-none border-0 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            : "bottom-4 right-4 w-[min(94vw,560px)] rounded-2xl p-3",
          expanded ? "shadow-2xl" : "shadow-xl",
        ].join(" ")}
        style={containerStyle}
      >
        {/* Resize handle */}
        {expandedDesktop && (
          <div
            className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize"
            onPointerDown={beginResize}
            onPointerMove={onResize}
            onPointerUp={endResize}
          />
        )}

        {/* Header */}
        <div
          className="mb-3 flex select-none items-center justify-between"
          style={expandedDesktop ? { cursor: "grab" } : undefined}
          onPointerDown={beginDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
        >
          <p className="text-sm font-medium tracking-wide text-foreground">New message</p>
          <div className="flex items-center gap-2">
            {!isMobile && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={toggleExpanded}
                className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                aria-label={expanded ? "Minimize composer" : "Expand composer"}
              >
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            )}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              aria-label="Close composer"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className={isMobile ? "flex min-h-0 flex-1 flex-col space-y-2" : "space-y-2"}>
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="To"
            className="h-10 rounded-lg border-white/10 bg-black/30 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-white/20 focus-visible:ring-0"
          />
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="h-10 rounded-lg border-white/10 bg-black/30 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-white/20 focus-visible:ring-0"
          />

          {/* Mode + font toolbar */}
          <div className="flex items-center justify-between gap-2">
            {/* Plain / HTML toggle */}
            <div className="flex rounded-md border border-white/10 bg-black/30 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => handleModeSwitch(false)}
                className={[
                  "rounded px-2.5 py-1 transition-colors",
                  !richText ? "bg-white/12 text-foreground" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                Plain
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch(true)}
                className={[
                  "rounded px-2.5 py-1 transition-colors",
                  richText ? "bg-white/12 text-foreground" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                HTML
              </button>
            </div>

            {/* Font selector */}
            <div className="relative flex items-center">
              <select
                value={font}
                onChange={(e) => handleFontChange(e.target.value as FontKey)}
                className="h-7 appearance-none rounded-md border border-white/10 bg-black/30 pl-2.5 pr-6 text-xs text-muted-foreground focus:outline-none focus:border-white/20"
                style={{ fontFamily: FONTS[font].css }}
              >
                {(Object.entries(FONTS) as [FontKey, { label: string; css: string }][]).map(([key, f]) => (
                  <option key={key} value={key} style={{ fontFamily: f.css }}>
                    {f.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={11} className="pointer-events-none absolute right-1.5 text-muted-foreground/60" />
            </div>
          </div>

          {/* Body */}
          {richText ? (
            <div
              className={[
                "relative overflow-hidden rounded-lg border border-white/10 bg-black/30",
                isMobile ? "min-h-0 flex-1" : "",
                bodyMinHeight,
                aiLoading ? "pointer-events-none" : "",
              ].join(" ")}
              style={{ fontFamily: FONTS[font].css }}
            >
              <VisualEditor
                ref={editorRef}
                value={body}
                onChange={setBody}
                onImageUpload={handleImageUpload}
                onSelectionChange={canAi ? bumpSelection : undefined}
              />
              {aiLoading && (
                <div className="absolute inset-0 z-10 cursor-wait rounded-lg" aria-hidden onWheel={(e) => e.preventDefault()} />
              )}
            </div>
          ) : (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              className={[
                "w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20",
                isMobile ? "min-h-0 flex-1" : "",
                bodyMinHeight,
              ].join(" ")}
              style={{ fontFamily: FONTS[font].css }}
            />
          )}
        </div>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void send(false)}
            disabled={sending || recipients.length === 0 || !subject.trim()}
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-foreground disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            onClick={() => void send(true)}
            disabled={sending || recipients.length === 0 || !subject.trim()}
            className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200 disabled:opacity-60"
          >
            Demo send
          </button>
          <span className="text-[11px] text-muted-foreground">
            Demo mode requires MAIL_DEMO_MODE=true.
          </span>
        </div>

        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        {info && <p className="mt-2 text-xs text-emerald-400">{info}</p>}
      </div>

      {/* AI assist — only active in HTML mode */}
      {canAi && richText && (
        <BlogAiAssistLayer
          enabled
          selectionRevision={selectionRevision}
          getEditor={getEditor}
          formatActions={formatActions}
          onFormatApplied={bumpSelection}
          onAiActionComplete={bumpSelection}
          onLoadingChange={setAiLoading}
        />
      )}
    </>
  )
}
