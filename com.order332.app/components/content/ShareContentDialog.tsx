"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Copy, Share2 } from "lucide-react"
import { Drawer as DrawerPrimitive } from "vaul"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  createContentShareLink,
  type ContentItemMeta,
  type ContentShareMode,
  type ShareExpiry,
} from "@/lib/content-api"
import { useIsMobile } from "@/hooks/use-mobile"

interface ShareContentDialogProps {
  item: ContentItemMeta
  open: boolean
  onOpenChange: (open: boolean) => void
}

type EmbedFormat = "html" | "markdown"

const EXPIRY_OPTIONS: Array<{
  value: ShareExpiry
  label: string
  description: string
}> = [
  { value: "24h", label: "24 hours", description: "Link expires tomorrow" },
  { value: "7d", label: "7 days", description: "Link expires in a week" },
  { value: "never", label: "Never", description: "Link never expires" },
]

const MODE_OPTIONS: Array<{
  value: ContentShareMode
  label: string
  description: string
}> = [
  {
    value: "internal",
    label: "Internal",
    description: "Requires login and opens in library",
  },
  {
    value: "external",
    label: "External",
    description: "Public guest page",
  },
]

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function buildContentEmbedCode({
  shareUrl,
  title,
  itemType,
  mode,
  format,
}: {
  shareUrl: string
  title: string
  itemType: ContentItemMeta["itemType"]
  mode: ContentShareMode
  format: EmbedFormat
}): string {
  const safeTitle = escapeHtmlAttr(title)
  const embedUrl = `${shareUrl}/embed`
  const imageUrl = `${shareUrl}/embed/image`

  if (format === "markdown") {
    if (mode === "external" && itemType === "image") {
      return `[![${title}](${imageUrl})](${shareUrl})`
    }
    return ""
  }

  if (mode === "external" && itemType === "video") {
    return `<iframe src="${embedUrl}" title="${safeTitle}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" referrerpolicy="no-referrer" style="width:100%;max-width:720px;aspect-ratio:16/9;border:0;border-radius:12px;overflow:hidden;"></iframe>`
  }

  if (mode === "external" && itemType === "image") {
    return `<a href="${shareUrl}" target="_blank" rel="noopener noreferrer"><img src="${imageUrl}" alt="${safeTitle}" style="display:block;max-width:100%;height:auto;border:0;border-radius:12px;"></a>`
  }

  return `<iframe src="${embedUrl}" title="${safeTitle}" loading="lazy" referrerpolicy="no-referrer" style="width:100%;max-width:620px;height:150px;border:0;border-radius:12px;overflow:hidden;"></iframe>`
}

function ShareBody({
  item,
  mode,
  setMode,
  expiresIn,
  setExpiresIn,
  shareUrl,
  expiresAt,
  copied,
  embedCopied,
  loading,
  error,
  externalBlockedReason,
  embedFormat,
  setEmbedFormat,
  embedCode,
  markdownAllowed,
  onCopy,
  onCopyEmbed,
  onCreate,
  onClose,
}: {
  item: ContentItemMeta
  mode: ContentShareMode
  setMode: (value: ContentShareMode) => void
  expiresIn: ShareExpiry
  setExpiresIn: (value: ShareExpiry) => void
  shareUrl: string | null
  expiresAt: string | null
  copied: boolean
  embedCopied: boolean
  loading: boolean
  error: string | null
  externalBlockedReason: string | null
  embedFormat: EmbedFormat
  setEmbedFormat: (value: EmbedFormat) => void
  embedCode: string
  markdownAllowed: boolean
  onCopy: () => void
  onCopyEmbed: () => void
  onCreate: () => void
  onClose: () => void
}) {
  const formatExpiry = (iso: string | null) => {
    if (!iso) return null
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" })
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <p className="truncate text-sm text-muted-foreground">{`"${item.title}"`}</p>

        {!shareUrl ? (
          <>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs tracking-wider text-muted-foreground">
                SHARE MODE
              </p>
              <div className="grid grid-cols-2 gap-2">
                {MODE_OPTIONS.map((opt) => {
                  const isBlocked =
                    opt.value === "external" && Boolean(externalBlockedReason)
                  return (
                    <button
                      key={opt.value}
                      onClick={() => !isBlocked && setMode(opt.value)}
                      disabled={isBlocked}
                      aria-pressed={mode === opt.value}
                      className={cn(
                        "flex flex-col items-center rounded-xl border px-3 py-2.5 text-center transition-colors",
                        mode === opt.value
                          ? "border-foreground/30 bg-foreground/10 text-foreground"
                          : "border-foreground/8 bg-foreground/4 text-muted-foreground hover:bg-foreground/8",
                        isBlocked && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span className="mt-0.5 text-[10px] opacity-60">
                        {opt.description}
                      </span>
                    </button>
                  )
                })}
              </div>
              {externalBlockedReason && (
                <p className="text-xs text-muted-foreground">
                  {externalBlockedReason}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs tracking-wider text-muted-foreground">
                LINK EXPIRES
              </p>
              <div className="grid grid-cols-3 gap-2">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setExpiresIn(opt.value)}
                    aria-pressed={expiresIn === opt.value}
                    className={cn(
                      "flex flex-col items-center rounded-xl border px-3 py-2.5 text-center transition-colors",
                      expiresIn === opt.value
                        ? "border-foreground/30 bg-foreground/10 text-foreground"
                        : "border-foreground/8 bg-foreground/4 text-muted-foreground hover:bg-foreground/8"
                    )}
                  >
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="mt-0.5 text-[10px] opacity-60">
                      {opt.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs tracking-wider text-muted-foreground">
                SHARE LINK
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-foreground/12 bg-foreground/4 px-3 py-2">
                <span className="min-w-0 flex-1 font-mono text-xs break-all text-foreground/80">
                  {shareUrl}
                </span>
                <button
                  onClick={onCopy}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-foreground/10"
                  aria-label="Copy link"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>
              {expiresAt ? (
                <p className="text-xs text-muted-foreground">
                  Expires {formatExpiry(expiresAt)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This link never expires
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs tracking-wider text-muted-foreground">
                  EMBED CODE
                </p>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-foreground/10 bg-foreground/4 p-1">
                  <button
                    onClick={() => setEmbedFormat("html")}
                    aria-pressed={embedFormat === "html"}
                    className={cn(
                      "rounded-md px-2 py-1 text-[10px] tracking-wide transition-colors",
                      embedFormat === "html"
                        ? "bg-foreground/12 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/8"
                    )}
                  >
                    HTML
                  </button>
                  <button
                    onClick={() =>
                      markdownAllowed && setEmbedFormat("markdown")
                    }
                    disabled={!markdownAllowed}
                    aria-pressed={embedFormat === "markdown"}
                    className={cn(
                      "rounded-md px-2 py-1 text-[10px] tracking-wide transition-colors",
                      embedFormat === "markdown"
                        ? "bg-foreground/12 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/8",
                      !markdownAllowed && "cursor-not-allowed opacity-45"
                    )}
                  >
                    Markdown
                  </button>
                </div>
              </div>

              {!markdownAllowed && (
                <p className="text-[11px] text-muted-foreground">
                  Markdown embed is available for external image shares.
                </p>
              )}

              <div className="rounded-lg border border-foreground/12 bg-foreground/4 px-3 py-2">
                <p className="font-mono text-[11px] break-all text-foreground/85">
                  {embedCode}
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={onCopyEmbed}
                  className="glass-button glass-button-ghost inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
                >
                  {embedCopied ? (
                    <>
                      <Check className="h-3 w-3 text-green-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy embed
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="glass-button glass-button-ghost rounded-lg px-3 py-1.5 text-xs tracking-widest"
        >
          {shareUrl ? "Done" : "Cancel"}
        </button>
        {!shareUrl && (
          <button
            onClick={onCreate}
            disabled={loading}
            className="glass-button glass-button-glass rounded-lg px-3 py-1.5 text-xs tracking-widest disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create link"}
          </button>
        )}
      </div>
    </>
  )
}

export function ShareContentDialog({
  item,
  open,
  onOpenChange,
}: ShareContentDialogProps) {
  const isMobile = useIsMobile()
  const [mode, setMode] = useState<ContentShareMode>("internal")
  const [expiresIn, setExpiresIn] = useState<ShareExpiry>("7d")
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [embedCopied, setEmbedCopied] = useState(false)
  const [embedFormat, setEmbedFormat] = useState<EmbedFormat>("html")
  const [error, setError] = useState<string | null>(null)

  const markdownAllowed = mode === "external" && item.itemType === "image"

  useEffect(() => {
    if (markdownAllowed) return
    setEmbedFormat("html")
  }, [markdownAllowed])

  const embedCode = useMemo(() => {
    if (!shareUrl) return ""
    return buildContentEmbedCode({
      shareUrl,
      title: item.title,
      itemType: item.itemType,
      mode,
      format: embedFormat,
    })
  }, [embedFormat, item.itemType, item.title, mode, shareUrl])

  const externalBlockedReason =
    item.itemType === "video"
      ? item.videoStatus !== "ready"
        ? "External video shares are available after processing finishes."
        : null
      : item.vtScanStatus !== "clean"
        ? "External sharing is only available for files marked clean by VirusTotal."
        : null

  const handleClose = (next: boolean) => {
    if (!next) {
      setShareUrl(null)
      setExpiresAt(null)
      setCopied(false)
      setEmbedCopied(false)
      setEmbedFormat("html")
      setError(null)
      setMode("internal")
      setExpiresIn("7d")
    }
    onOpenChange(next)
  }

  const handleCreate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await createContentShareLink(item.id, mode, expiresIn)
      setShareUrl(result.shareUrl)
      setExpiresAt(result.expiresAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create share link")
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.createElement("textarea")
      el.value = shareUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCopyEmbed = async () => {
    if (!embedCode) return
    try {
      await navigator.clipboard.writeText(embedCode)
      setEmbedCopied(true)
      setTimeout(() => setEmbedCopied(false), 2000)
    } catch {
      const el = document.createElement("textarea")
      el.value = embedCode
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setEmbedCopied(true)
      setTimeout(() => setEmbedCopied(false), 2000)
    }
  }

  const sharedProps = {
    item,
    mode,
    setMode,
    expiresIn,
    setExpiresIn,
    shareUrl,
    expiresAt,
    copied,
    embedCopied,
    loading,
    error,
    externalBlockedReason,
    embedFormat,
    setEmbedFormat,
    embedCode,
    markdownAllowed,
    onCopy: handleCopy,
    onCopyEmbed: handleCopyEmbed,
    onCreate: handleCreate,
    onClose: () => handleClose(false),
  }

  if (isMobile) {
    return (
      <DrawerPrimitive.Root
        open={open}
        onOpenChange={handleClose}
        direction="bottom"
      >
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40" />
          <DrawerPrimitive.Content className="fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-2xl bg-popover pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none">
            <DrawerPrimitive.Title className="sr-only">
              Share content
            </DrawerPrimitive.Title>
            <div className="flex shrink-0 items-center px-4 pt-3 pb-1">
              <div className="mx-auto h-1 w-10 rounded-full bg-foreground/20" />
            </div>
            <div className="flex flex-col gap-1 px-5 pt-3 pb-2">
              <p className="text-base font-semibold text-foreground">
                Share content
              </p>
              <ShareBody {...sharedProps} />
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        showCloseButton={false}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Share content</DialogTitle>
        </DialogHeader>
        <ShareBody {...sharedProps} />
      </DialogContent>
    </Dialog>
  )
}

export function ShareContentButton({
  item,
  className,
}: {
  item: ContentItemMeta
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className={className}
        aria-label="Share content"
      >
        <Share2 className="h-3.5 w-3.5" />
      </button>
      <ShareContentDialog item={item} open={open} onOpenChange={setOpen} />
    </>
  )
}
