"use client"

import { useState } from "react"
import { Download, ExternalLink, File, FileText, Loader2, Music, Shield, ShieldAlert, ShieldCheck, ShieldOff, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatFileSize, type ContentItemMeta, type VtScanStatus, type VtScanStats } from "@/lib/content-api"
import { AudioPlayerButton, AudioPlayerProgress, AudioPlayerTime, AudioPlayerDuration } from "@/components/ui/audio-player"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ContentItemCardProps {
  item: ContentItemMeta
  isCreator: boolean
  onDelete: (id: string) => void
}

export function ContentItemCard({ item, isCreator, onDelete }: ContentItemCardProps) {
  const [imageExpanded, setImageExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [vtOpen, setVtOpen] = useState(false)
  // When set, the VT dialog shows a "Download anyway" CTA for flagged files
  const [vtDownloadFn, setVtDownloadFn] = useState<(() => void) | null>(null)

  const openVtInfo = () => { setVtDownloadFn(null); setVtOpen(true) }
  const openVtGate = (fn: () => void) => { setVtDownloadFn(() => fn); setVtOpen(true) }

  const handleDeleteConfirm = () => {
    setDeleting(true)
    setConfirmOpen(false)
    onDelete(item.id)
  }

  return (
    <div className="glass-card group relative flex flex-col overflow-hidden rounded-xl">
      {/* Creator delete button */}
      {isCreator && (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
          disabled={deleting}
          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/80"
          aria-label="Delete item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Delete confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{item.title}" will be permanently deleted and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {item.itemType === "image" && (
        <ImageCard item={item} onExpand={() => setImageExpanded(true)} />
      )}
      {item.itemType === "audio" && <AudioCard item={item} />}
      {item.itemType === "pdf" && <PdfCard item={item} onVtBadge={openVtInfo} onVtGate={openVtGate} />}
      {item.itemType === "download" && <DownloadCard item={item} onVtBadge={openVtInfo} onVtGate={openVtGate} />}

      {/* Image expand dialog */}
      {item.itemType === "image" && (
        <Dialog open={imageExpanded} onOpenChange={setImageExpanded}>
          <DialogContent className="max-w-4xl p-2">
            <DialogTitle className="sr-only">{item.title}</DialogTitle>
            <img
              src={item.publicUrl}
              alt={item.title}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          </DialogContent>
        </Dialog>
      )}

      {/* VT info / download-gate dialog */}
      <VtDialog
        open={vtOpen}
        onClose={() => setVtOpen(false)}
        onDownload={vtDownloadFn ?? undefined}
        status={item.vtScanStatus}
        stats={item.vtScanStats}
        vtUrl={item.vtScanUrl}
      />
    </div>
  )
}

// ── Image ────────────────────────────────────────────────────────────────────

function ImageCard({ item, onExpand }: { item: ContentItemMeta; onExpand: () => void }) {
  return (
    <div className="flex flex-col">
      {/* Natural-ratio image — no forced aspect-square */}
      <button onClick={onExpand} className="w-full text-left overflow-hidden">
        <img
          src={item.publicUrl}
          alt={item.title}
          className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </button>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(item.fileSize)}</p>
        </div>
        <a
          href={item.publicUrl}
          download={item.title}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/8 hover:text-foreground transition-colors"
          aria-label="Download image"
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}

// ── Audio ────────────────────────────────────────────────────────────────────

function AudioCard({ item }: { item: ContentItemMeta }) {
  const audioItem = { id: item.id, src: item.publicUrl }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5">
        <Music className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(item.fileSize)}</p>
      </div>
      <div className="flex items-center gap-3">
        <AudioPlayerButton item={audioItem} size="sm" variant="ghost" className="h-8 w-8 rounded-full p-0" />
        <div className="flex-1">
          <AudioPlayerProgress className="w-full" />
        </div>
        <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
          <AudioPlayerTime />
          <span>/</span>
          <AudioPlayerDuration />
        </div>
      </div>
      <a
        href={item.publicUrl}
        download={item.title}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </a>
    </div>
  )
}

// ── PDF ──────────────────────────────────────────────────────────────────────

function PdfCard({
  item,
  onVtBadge,
  onVtGate,
}: { item: ContentItemMeta; onVtBadge: () => void; onVtGate: (fn: () => void) => void }) {
  const status = item.vtScanStatus
  const isBlocked = status === "pending" || status === "scanning"

  const handleOpen = (e: React.MouseEvent) => {
    if (isBlocked) { e.preventDefault(); return }
    if (status === "flagged" || status === "error") {
      e.preventDefault()
      onVtGate(() => window.open(item.publicUrl, "_blank", "noopener,noreferrer"))
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground/5">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <VtBadge status={status} stats={item.vtScanStats} onClick={onVtBadge} />
      </div>
      <div>
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{formatFileSize(item.fileSize)} · PDF</p>
      </div>
      <div className="flex items-center gap-3">
        <a
          href={isBlocked ? undefined : item.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleOpen}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs transition-colors",
            isBlocked ? "cursor-not-allowed text-muted-foreground/40" : "text-muted-foreground hover:text-foreground",
          )}
          aria-disabled={isBlocked}
          title={isBlocked ? "Awaiting scan" : "Open in new tab"}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </a>
        <a
          href={isBlocked ? undefined : item.publicUrl}
          download={item.title}
          onClick={(e) => {
            if (isBlocked) { e.preventDefault(); return }
            if (status === "flagged" || status === "error") {
              e.preventDefault()
              onVtGate(() => {
                const a = document.createElement("a")
                a.href = item.publicUrl
                a.download = item.title
                a.rel = "noopener noreferrer"
                a.click()
              })
            }
          }}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs transition-colors",
            isBlocked ? "cursor-not-allowed text-muted-foreground/40" : "text-muted-foreground hover:text-foreground",
          )}
          aria-disabled={isBlocked}
          title={isBlocked ? "Awaiting scan" : "Download"}
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </div>
    </div>
  )
}

// ── Download ──────────────────────────────────────────────────────────────────

function DownloadCard({
  item,
  onVtBadge,
  onVtGate,
}: { item: ContentItemMeta; onVtBadge: () => void; onVtGate: (fn: () => void) => void }) {
  const status = item.vtScanStatus
  const isBlocked = status === "pending" || status === "scanning"
  const needsGate = status === "flagged" || status === "error"

  const triggerDownload = () => {
    const a = document.createElement("a")
    a.href = item.publicUrl
    a.download = item.title
    a.rel = "noopener noreferrer"
    a.click()
  }

  const handleDownload = (e: React.MouseEvent) => {
    if (isBlocked) { e.preventDefault(); return }
    if (needsGate) { e.preventDefault(); onVtGate(triggerDownload) }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground/5">
          <File className="h-5 w-5 text-muted-foreground" />
        </div>
        <VtBadge status={status} stats={item.vtScanStats} onClick={onVtBadge} />
      </div>
      <div className="flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{formatFileSize(item.fileSize)}</p>
      </div>
      <a
        href={isBlocked ? undefined : item.publicUrl}
        download={item.title}
        onClick={handleDownload}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs transition-colors w-fit",
          isBlocked ? "cursor-not-allowed text-muted-foreground/40" : "text-muted-foreground hover:text-foreground",
        )}
        aria-disabled={isBlocked}
        title={isBlocked ? "Awaiting scan" : undefined}
      >
        <Download className="h-3.5 w-3.5" />
        {isBlocked ? "Scanning…" : "Download"}
      </a>
    </div>
  )
}

// ── VT badge ──────────────────────────────────────────────────────────────────
// Always rendered for scanned types (not for images/audio which are not_required).

function VtBadge({ status, stats, onClick }: { status: VtScanStatus; stats: VtScanStats | null; onClick: () => void }) {
  if (status === "not_required") return null

  const { icon, label, className } = vtBadgeProps(status, stats)

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-opacity hover:opacity-80",
        className,
      )}
      aria-label="VirusTotal scan result"
    >
      {icon}
      {label}
    </button>
  )
}

function vtBadgeProps(status: VtScanStatus, stats: VtScanStats | null) {
  switch (status) {
    case "scanning":
    case "pending":
      return {
        icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,
        label: "Scanning…",
        className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
      }
    case "clean": {
      const total = stats ? Object.values(stats).reduce((a, b) => a + b, 0) : null
      return {
        icon: <ShieldCheck className="h-2.5 w-2.5" />,
        label: total !== null ? `Clean · ${total}` : "Clean",
        className: "bg-green-500/10 text-green-600 dark:text-green-400",
      }
    }
    case "flagged": {
      const count = (stats?.malicious ?? 0) + (stats?.suspicious ?? 0)
      return {
        icon: <ShieldAlert className="h-2.5 w-2.5" />,
        label: count > 0 ? `${count} threat${count !== 1 ? "s" : ""}` : "Flagged",
        className: "bg-destructive/10 text-destructive",
      }
    }
    case "error":
      return {
        icon: <ShieldOff className="h-2.5 w-2.5" />,
        label: "Scan failed",
        className: "bg-muted text-muted-foreground",
      }
    default:
      return {
        icon: <Shield className="h-2.5 w-2.5" />,
        label: "Unknown",
        className: "bg-muted text-muted-foreground",
      }
  }
}

// ── VT dialog (info + optional download gate) ─────────────────────────────────

interface VtDialogProps {
  open: boolean
  onClose: () => void
  onDownload?: () => void   // if set → shows "Download anyway" confirm CTA
  status: VtScanStatus
  stats: VtScanStats | null
  vtUrl: string | null
}

function VtDialog({ open, onClose, onDownload, status, stats, vtUrl }: VtDialogProps) {
  const handleDownload = () => {
    onDownload?.()
    onClose()
  }

  const total = stats ? Object.values(stats).reduce((a: number, b: number) => a + b, 0) : null
  const malicious = stats?.malicious ?? 0
  const suspicious = stats?.suspicious ?? 0

  const heading = vtDialogHeading(status, onDownload)
  const body = vtDialogBody(status, stats, total, malicious, suspicious)

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {vtDialogIcon(status)}
            {heading}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {body}
            {vtUrl && (
              <>
                {" "}
                <a
                  href={vtUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  View full VirusTotal report
                </a>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onClose}
            className={!onDownload ? "col-span-2" : undefined}
          >
            {onDownload ? "Cancel" : "Close"}
          </AlertDialogCancel>
          {onDownload && (
            <AlertDialogAction variant="destructive" onClick={handleDownload}>
              Download anyway
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function vtDialogIcon(status: VtScanStatus) {
  switch (status) {
    case "clean":    return <ShieldCheck className="h-5 w-5 text-green-500" />
    case "flagged":  return <ShieldAlert className="h-5 w-5 text-destructive" />
    case "error":    return <ShieldOff className="h-5 w-5 text-muted-foreground" />
    default:         return <Loader2 className="h-5 w-5 animate-spin text-yellow-500" />
  }
}

function vtDialogHeading(status: VtScanStatus, onDownload?: () => void) {
  switch (status) {
    case "clean":            return "No threats detected"
    case "flagged":          return onDownload ? "This file may be unsafe" : "Threats detected"
    case "error":            return "Scan could not complete"
    case "scanning":
    case "pending":          return "Scan in progress"
    default:                 return "VirusTotal scan"
  }
}

function vtDialogBody(
  status: VtScanStatus,
  stats: VtScanStats | null,
  total: number | null,
  malicious: number,
  suspicious: number,
) {
  switch (status) {
    case "clean":
      return total !== null
        ? `All ${total} security engines found this file safe.`
        : "This file passed all security checks."
    case "flagged": {
      const parts: string[] = []
      if (malicious > 0) parts.push(`${malicious} engine${malicious !== 1 ? "s" : ""} flagged it as malicious`)
      if (suspicious > 0) parts.push(`${suspicious} flagged it as suspicious`)
      return parts.length > 0 ? parts.join(", ") + "." : "One or more security engines flagged this file."
    }
    case "error":
      return "VirusTotal could not complete the scan for this file. Proceed with caution."
    case "scanning":
    case "pending":
      return "This file is currently being analysed by VirusTotal. Check back in a moment."
    default:
      return "No scan information available."
  }
}
