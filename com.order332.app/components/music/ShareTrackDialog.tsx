"use client"

import { useState } from "react"
import { Check, Copy, Share2 } from "lucide-react"
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

export function ShareTrackDialog({ trackId, trackTitle, open, onOpenChange }: ShareTrackDialogProps) {
  const [expiresIn, setExpiresIn] = useState<ExpiryOption>("7d")
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = (next: boolean) => {
    if (!next) {
      // Reset state when dialog closes
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
      // Fallback for environments without clipboard API
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

  const formatExpiry = (iso: string | null) => {
    if (!iso) return null
    return new Date(iso).toLocaleDateString(undefined, {
      dateStyle: "medium",
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={false} onClick={(e) => e.stopPropagation()} className="z-[60]" overlayClassName="z-[60]">
        <DialogHeader>
          <DialogTitle>Share track</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground truncate">
            "{trackTitle}"
          </p>

          {!shareUrl ? (
            <>
              {/* Expiry options */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs tracking-wider text-muted-foreground">LINK EXPIRES</p>
                <div className="grid grid-cols-3 gap-2">
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setExpiresIn(opt.value)}
                      className={cn(
                        "flex flex-col items-center rounded-xl px-3 py-2.5 text-center transition-colors border",
                        expiresIn === opt.value
                          ? "border-foreground/30 bg-foreground/10 text-foreground"
                          : "border-foreground/8 bg-foreground/4 text-muted-foreground hover:bg-foreground/8",
                      )}
                    >
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span className="mt-0.5 text-[10px] opacity-60">{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Share URL display */}
              <p className="text-xs tracking-wider text-muted-foreground">SHARE LINK</p>
              <div className="flex items-center gap-2 rounded-lg border border-foreground/12 bg-foreground/4 px-3 py-2">
                <span className="flex-1 min-w-0 break-all text-xs text-foreground/80 font-mono">
                  {shareUrl}
                </span>
                <button
                  onClick={handleCopy}
                  className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-foreground/10"
                  aria-label="Copy link"
                >
                  {copied
                    ? <Check className="h-3.5 w-3.5 text-green-400" />
                    : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
              {expiresAt ? (
                <p className="text-xs text-muted-foreground">
                  Expires {formatExpiry(expiresAt)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">This link never expires</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>
            {shareUrl ? "Done" : "Cancel"}
          </Button>
          {!shareUrl && (
            <Button size="sm" onClick={handleCreate} disabled={loading}>
              {loading ? "Creating…" : "Create link"}
            </Button>
          )}
        </DialogFooter>
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

export function ShareTrackButton({ trackId, trackTitle, className }: ShareTrackButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
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
