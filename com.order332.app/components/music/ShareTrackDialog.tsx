"use client"

import { useState } from "react"
import { Check, Copy, Share2 } from "lucide-react"
import { Drawer as DrawerPrimitive } from "vaul"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createMusicShareLink } from "@/lib/music-api"
import { useIsMobile } from "@/hooks/use-mobile"

type ExpiryOption = "24h" | "7d" | "never"

interface ExpiryChoice {
  value: ExpiryOption
  label: string
  description: string
}

const EXPIRY_OPTIONS: ExpiryChoice[] = [
  { value: "24h", label: "24 hours", description: "Link expires tomorrow" },
  { value: "7d", label: "7 days", description: "Link expires in a week" },
  { value: "never", label: "Never", description: "Link never expires" },
]

interface ShareTrackDialogProps {
  trackId: string
  trackTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Shared content (used by both mobile and desktop) ─────────────────────────
function ShareContent({
  trackTitle,
  expiresIn,
  setExpiresIn,
  shareUrl,
  expiresAt,
  copied,
  loading,
  error,
  onCopy,
  onCreate,
  onClose,
}: {
  trackTitle: string
  expiresIn: ExpiryOption
  setExpiresIn: (v: ExpiryOption) => void
  shareUrl: string | null
  expiresAt: string | null
  copied: boolean
  loading: boolean
  error: string | null
  onCopy: () => void
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
        <p className="truncate text-sm text-muted-foreground">{`"${trackTitle}"`}</p>

        {!shareUrl ? (
          <>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs tracking-wider text-muted-foreground">
                LINK EXPIRES
              </p>
              <div className="grid grid-cols-3 gap-2">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setExpiresIn(opt.value)}
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
        )}
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {shareUrl ? "Done" : "Cancel"}
        </Button>
        {!shareUrl && (
          <Button size="sm" onClick={onCreate} disabled={loading}>
            {loading ? "Creating…" : "Create link"}
          </Button>
        )}
      </div>
    </>
  )
}

export function ShareTrackDialog({
  trackId,
  trackTitle,
  open,
  onOpenChange,
}: ShareTrackDialogProps) {
  const isMobile = useIsMobile()
  const [expiresIn, setExpiresIn] = useState<ExpiryOption>("7d")
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = (next: boolean) => {
    if (!next) {
      setShareUrl(null)
      setExpiresAt(null)
      setCopied(false)
      setError(null)
    }
    onOpenChange(next)
  }

  const handleCreate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await createMusicShareLink(trackId, expiresIn)
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

  const sharedProps = {
    trackTitle,
    expiresIn,
    setExpiresIn,
    shareUrl,
    expiresAt,
    copied,
    loading,
    error,
    onCopy: handleCopy,
    onCreate: handleCreate,
    onClose: () => handleClose(false),
  }

  // ── Mobile: vaul bottom sheet (avoids vaul touch event conflicts) ─────────
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
              Share track
            </DrawerPrimitive.Title>
            <div className="flex shrink-0 items-center px-4 pt-3 pb-1">
              <div className="mx-auto h-1 w-10 rounded-full bg-foreground/20" />
            </div>
            <div className="flex flex-col gap-1 px-5 pt-3 pb-2">
              <p className="text-base font-semibold text-foreground">
                Share track
              </p>
              <ShareContent {...sharedProps} />
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    )
  }

  // ── Desktop: centered base-ui dialog ─────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        showCloseButton={false}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Share track</DialogTitle>
        </DialogHeader>
        <ShareContent {...sharedProps} />
      </DialogContent>
    </Dialog>
  )
}

// Convenience trigger button + dialog in one component
interface ShareTrackButtonProps {
  trackId: string
  trackTitle: string
  className?: string
}

export function ShareTrackButton({
  trackId,
  trackTitle,
  className,
}: ShareTrackButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className={className}
        aria-label="Share track"
      >
        <Share2 className="h-3.5 w-3.5" />
      </button>
      <ShareTrackDialog
        trackId={trackId}
        trackTitle={trackTitle}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
