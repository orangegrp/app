"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import {
  Download,
  ExternalLink,
  File,
  FileText,
  Music,
  Play,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Video,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"
import {
  formatFileSize,
  fetchVideoDownloadUrl,
  fetchVideoSource,
  fetchContentThreatInfo,
  normalizeContentItemType,
  retryVtScan,
  type ContentItemMeta,
  type VtThreatInfo,
  type VtScanStatus,
  type VtScanStats,
} from "@/lib/content-api"
import {
  AudioPlayerButton,
  AudioPlayerProgress,
  AudioPlayerTime,
  AudioPlayerDuration,
} from "@/components/ui/audio-player"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { VideoPlayer } from "@/components/ui/VideoPlayer"

interface ContentItemCardProps {
  item: ContentItemMeta
  isCreator: boolean
  onDelete: (id: string) => void
  onUpdate: (item: ContentItemMeta) => void
}

export function ContentItemCard({
  item,
  isCreator,
  onDelete,
  onUpdate,
}: ContentItemCardProps) {
  const [imageExpanded, setImageExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [vtOpen, setVtOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoActionError, setVideoActionError] = useState<string | null>(null)
  // When set, the VT dialog shows a "Download anyway" CTA for flagged files
  const [vtDownloadFn, setVtDownloadFn] = useState<(() => void) | null>(null)

  const openVtInfo = () => {
    setVtDownloadFn(null)
    setVtOpen(true)
  }
  const openVtGate = (fn: () => void) => {
    setVtDownloadFn(() => fn)
    setVtOpen(true)
  }
  const itemType = normalizeContentItemType(item.itemType, item.mimeType)
  const videoAspectRatio =
    item.width && item.height && item.width > 0 && item.height > 0
      ? `${item.width} / ${item.height}`
      : "16 / 9"
  const videoDialogWidth =
    item.width && item.height && item.width > 0 && item.height > 0
      ? `min(92vw, ${(72 * (item.width / item.height)).toFixed(2)}vh)`
      : "min(92vw, 1100px)"

  const handleRetry = async () => {
    try {
      const { item: updated } = await retryVtScan(item.id)
      onUpdate(updated)
      setVtOpen(false)
    } catch (err) {
      console.error("[ContentItemCard] retry error:", err)
    }
  }

  const handleDeleteConfirm = () => {
    setDeleting(true)
    setConfirmOpen(false)
    onDelete(item.id)
  }

  const openVideo = async () => {
    if (item.videoStatus && item.videoStatus !== "ready") return
    setVideoLoading(true)
    setVideoActionError(null)
    try {
      const { url } = await fetchVideoSource(item.id)
      setVideoSrc(url)
      setVideoOpen(true)
    } catch (err) {
      setVideoActionError(
        err instanceof Error ? err.message : "Failed to open video"
      )
    } finally {
      setVideoLoading(false)
    }
  }

  const downloadVideo = async () => {
    if (item.videoStatus && item.videoStatus !== "ready") return
    setVideoLoading(true)
    setVideoActionError(null)
    try {
      const { url } = await fetchVideoDownloadUrl(item.id)
      window.location.assign(url)
    } catch (err) {
      setVideoActionError(
        err instanceof Error ? err.message : "Failed to prepare download"
      )
    } finally {
      setVideoLoading(false)
    }
  }

  return (
    <div
      className={cn(
        "glass-card group relative flex cursor-grab flex-col overflow-hidden rounded-xl active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-content-item-id", item.id)
        e.dataTransfer.effectAllowed = "move"
        setIsDragging(true)
      }}
      onDragEnd={() => setIsDragging(false)}
    >
      {/* Creator delete button */}
      {isCreator && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setConfirmOpen(true)
          }}
          disabled={deleting}
          className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/80"
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
              &quot;{item.title}&quot; will be permanently deleted and cannot be
              recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {itemType === "image" && (
        <ImageCard item={item} onExpand={() => setImageExpanded(true)} />
      )}
      {itemType === "audio" && <AudioCard item={item} />}
      {itemType === "video" && (
        <VideoCard
          item={item}
          loading={videoLoading}
          error={videoActionError}
          onPlay={openVideo}
          onDownload={downloadVideo}
        />
      )}
      {itemType === "pdf" && (
        <PdfCard item={item} onVtBadge={openVtInfo} onVtGate={openVtGate} />
      )}
      {itemType === "download" && (
        <DownloadCard
          item={item}
          onVtBadge={openVtInfo}
          onVtGate={openVtGate}
        />
      )}

      {/* Image expand dialog */}
      {itemType === "image" && (
        <Dialog open={imageExpanded} onOpenChange={setImageExpanded}>
          <DialogContent className="max-w-4xl p-2">
            <DialogTitle className="sr-only">{item.title}</DialogTitle>
            <Image
              src={item.publicUrl}
              alt={item.title}
              width={1200}
              height={900}
              unoptimized
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Video dialog */}
      {itemType === "video" && (
        <Dialog
          open={videoOpen}
          onOpenChange={(open) => {
            setVideoOpen(open)
            if (!open) setVideoSrc(null)
          }}
        >
          <DialogContent
            showCloseButton={false}
            style={{ width: videoDialogWidth, maxWidth: "92vw" }}
            className="p-2 sm:max-h-[86vh] sm:[min-height:280px] sm:[min-width:420px] sm:resize sm:overflow-auto"
          >
            <DialogTitle className="sr-only">{item.title}</DialogTitle>
            <DialogClose
              className="glass-button glass-button-ghost absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full text-white/95 hover:text-white"
              aria-label="Close video"
            >
              <X className="h-4 w-4" />
            </DialogClose>
            {videoSrc ? (
              <div
                className="max-h-[82vh] w-full"
                style={{ aspectRatio: videoAspectRatio }}
              >
                <VideoPlayer
                  src={videoSrc}
                  className="h-full w-full"
                  autoPlay
                />
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center">
                <Spinner size="md" clockwise />
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* VT info / download-gate dialog */}
      <VtDialog
        itemId={item.id}
        open={vtOpen}
        onClose={() => setVtOpen(false)}
        onDownload={vtDownloadFn ?? undefined}
        onRetry={item.vtScanStatus === "error" ? handleRetry : undefined}
        status={item.vtScanStatus}
        stats={item.vtScanStats}
        vtUrl={item.vtScanUrl}
      />
    </div>
  )
}

// ── Image ────────────────────────────────────────────────────────────────────

function ImageCard({
  item,
  onExpand,
}: {
  item: ContentItemMeta
  onExpand: () => void
}) {
  return (
    <div className="flex flex-col">
      {/* Natural-ratio image — no forced aspect-square */}
      <button onClick={onExpand} className="w-full overflow-hidden text-left">
        <Image
          src={item.publicUrl}
          alt={item.title}
          width={1200}
          height={900}
          unoptimized
          className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </button>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {item.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(item.fileSize)}
          </p>
        </div>
        <a
          href={item.publicUrl}
          download={item.title}
          onClick={(e) => e.stopPropagation()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
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
        <p className="truncate text-sm font-medium text-foreground">
          {item.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(item.fileSize)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <AudioPlayerButton
          item={audioItem}
          size="sm"
          variant="ghost"
          className="h-8 w-8 rounded-full p-0"
        />
        <div className="flex-1">
          <AudioPlayerProgress className="w-full" />
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <AudioPlayerTime />
          <span>/</span>
          <AudioPlayerDuration />
        </div>
      </div>
      <a
        href={item.publicUrl}
        download={item.title}
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </a>
    </div>
  )
}

// ── Video ────────────────────────────────────────────────────────────────────

function VideoCard({
  item,
  loading,
  error,
  onPlay,
  onDownload,
}: {
  item: ContentItemMeta
  loading: boolean
  error: string | null
  onPlay: () => void
  onDownload: () => void
}) {
  const status = item.videoStatus ?? "processing"
  const isReady = status === "ready"
  const isErrored = status === "errored"

  return (
    <div className="flex h-full flex-col">
      <button
        onClick={onPlay}
        disabled={!isReady || loading}
        className={cn(
          "relative flex h-36 w-full items-center justify-center overflow-hidden border-b border-foreground/10 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900",
          isReady ? "cursor-pointer" : "cursor-not-allowed opacity-70"
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_60%)]" />
        <Video className="h-8 w-8 text-white/70" />
        {isReady && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </span>
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {item.title}
          </p>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {item.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {formatFileSize(item.fileSize)}
          </p>
          {status === "processing" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Processing video…
            </p>
          )}
          {isErrored && (
            <p className="mt-1 text-xs text-destructive">
              {item.videoError ?? "Video processing failed"}
            </p>
          )}
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onPlay}
            disabled={!isReady || loading}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs transition-colors",
              isReady
                ? "text-muted-foreground hover:text-foreground"
                : "cursor-not-allowed text-muted-foreground/40"
            )}
          >
            <Play className="h-3.5 w-3.5" />
            {loading ? "Loading…" : "Play"}
          </button>
          <button
            onClick={onDownload}
            disabled={!isReady || loading}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs transition-colors",
              isReady
                ? "text-muted-foreground hover:text-foreground"
                : "cursor-not-allowed text-muted-foreground/40"
            )}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PDF ──────────────────────────────────────────────────────────────────────

function PdfCard({
  item,
  onVtBadge,
  onVtGate,
}: {
  item: ContentItemMeta
  onVtBadge: () => void
  onVtGate: (fn: () => void) => void
}) {
  const status = item.vtScanStatus
  const isBlocked = status === "pending" || status === "scanning"

  const handleOpen = (e: React.MouseEvent) => {
    if (isBlocked) {
      e.preventDefault()
      return
    }
    if (status === "flagged" || status === "error") {
      e.preventDefault()
      onVtGate(() =>
        window.open(item.publicUrl, "_blank", "noopener,noreferrer")
      )
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
        <p className="truncate text-sm font-medium text-foreground">
          {item.title}
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {item.description}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatFileSize(item.fileSize)} · PDF
        </p>
      </div>
      <div className="flex items-center gap-3">
        <a
          href={isBlocked ? undefined : item.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleOpen}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs transition-colors",
            isBlocked
              ? "pointer-events-none cursor-not-allowed text-muted-foreground/40"
              : "text-muted-foreground hover:text-foreground"
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
            if (isBlocked) {
              e.preventDefault()
              return
            }
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
            isBlocked
              ? "pointer-events-none cursor-not-allowed text-muted-foreground/40"
              : "text-muted-foreground hover:text-foreground"
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
}: {
  item: ContentItemMeta
  onVtBadge: () => void
  onVtGate: (fn: () => void) => void
}) {
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
    if (isBlocked) {
      e.preventDefault()
      return
    }
    if (needsGate) {
      e.preventDefault()
      onVtGate(triggerDownload)
    }
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
        <p className="truncate text-sm font-medium text-foreground">
          {item.title}
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {item.description}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatFileSize(item.fileSize)}
        </p>
      </div>
      <a
        href={isBlocked ? undefined : item.publicUrl}
        download={item.title}
        onClick={handleDownload}
        className={cn(
          "inline-flex w-fit items-center gap-1.5 text-xs transition-colors",
          isBlocked
            ? "pointer-events-none cursor-not-allowed text-muted-foreground/40"
            : "text-muted-foreground hover:text-foreground"
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

function VtBadge({
  status,
  stats,
  onClick,
}: {
  status: VtScanStatus
  stats: VtScanStats | null
  onClick: () => void
}) {
  if (status === "not_required") return null

  const { icon, label, className } = vtBadgeProps(status, stats)

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-opacity hover:opacity-80",
        className
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
        icon: <Spinner size="xs" className="text-yellow-500" />,
        label: "Scanning…",
        className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
      }
    case "clean": {
      const total = stats
        ? Object.values(stats).reduce((a, b) => a + b, 0)
        : null
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
        label:
          count > 0 ? `${count} threat${count !== 1 ? "s" : ""}` : "Flagged",
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
  itemId: string
  open: boolean
  onClose: () => void
  onDownload?: () => void // if set → shows "Download anyway" confirm CTA
  onRetry?: () => Promise<void> // if set → shows "Retry scan" button (error state)
  status: VtScanStatus
  stats: VtScanStats | null
  vtUrl: string | null
}

function VtDialog({
  itemId,
  open,
  onClose,
  onDownload,
  onRetry,
  status,
  stats,
  vtUrl,
}: VtDialogProps) {
  const [retrying, setRetrying] = useState(false)
  const [threatInfo, setThreatInfo] = useState<VtThreatInfo | null>(null)
  const [threatError, setThreatError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setThreatError(null)
    fetchContentThreatInfo(itemId)
      .then(({ threat }) => {
        if (!active) return
        setThreatInfo(threat)
      })
      .catch(() => {
        if (!active) return
        setThreatError("Could not refresh threat details.")
      })

    return () => {
      active = false
    }
  }, [itemId, open])

  const handleDownload = () => {
    onDownload?.()
    onClose()
  }

  const handleRetry = async () => {
    if (!onRetry) return
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  const effectiveStats = threatInfo?.stats ?? stats
  const effectiveVtUrl = threatInfo?.vtUrl ?? vtUrl
  const total = effectiveStats
    ? effectiveStats.malicious +
      effectiveStats.suspicious +
      effectiveStats.undetected +
      effectiveStats.harmless +
      effectiveStats.timeout +
      effectiveStats.failure +
      effectiveStats["type-unsupported"]
    : null
  const malicious = effectiveStats?.malicious ?? 0
  const suspicious = effectiveStats?.suspicious ?? 0

  const heading = vtDialogHeading(status, onDownload)
  const body = vtDialogBody(
    status,
    effectiveStats,
    total,
    malicious,
    suspicious
  )

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <AlertDialogContent className="!h-auto !max-h-[80vh] w-[min(96vw,980px)] max-w-none !overflow-hidden">
        <AlertDialogHeader className="!block items-start text-left">
          <AlertDialogTitle className="flex items-center gap-2">
            {vtDialogIcon(status)}
            {heading}
          </AlertDialogTitle>
          <AlertDialogDescription className="max-h-[58vh] w-full overflow-y-auto pr-1 text-left">
            {body}
            {(threatError || threatInfo) && (
              <div className="mt-3 grid gap-3 text-xs text-muted-foreground lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-3">
                  {threatError && <p>{threatError}</p>}
                  {threatInfo && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span>Malicious:</span>
                        <span className="text-foreground">{malicious}</span>
                        <span>Suspicious:</span>
                        <span className="text-foreground">{suspicious}</span>
                        <span>Harmless:</span>
                        <span className="text-foreground">
                          {effectiveStats?.harmless ?? 0}
                        </span>
                        <span>Undetected:</span>
                        <span className="text-foreground">
                          {effectiveStats?.undetected ?? 0}
                        </span>
                        {threatInfo.reputation !== null && (
                          <>
                            <span>Reputation:</span>
                            <span className="text-foreground">
                              {threatInfo.reputation}
                            </span>
                          </>
                        )}
                        {threatInfo.typeDescription && (
                          <>
                            <span>Type:</span>
                            <span className="text-foreground">
                              {threatInfo.typeDescription}
                            </span>
                          </>
                        )}
                      </div>
                      {threatInfo.meaningfulName && (
                        <p className="truncate">
                          Name:{" "}
                          <span className="text-foreground">
                            {threatInfo.meaningfulName}
                          </span>
                        </p>
                      )}
                      {threatInfo.lastAnalysisAt && (
                        <p>
                          Last analysis:{" "}
                          <span className="text-foreground">
                            {new Date(
                              threatInfo.lastAnalysisAt
                            ).toLocaleString()}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-3">
                  <p className="mb-2 text-foreground">Top detections</p>
                  {threatInfo?.detections.length ? (
                    <div className="max-h-[38vh] overflow-y-auto rounded-md border border-foreground/10 bg-background/40 px-2 py-1">
                      {threatInfo.detections.map((detection) => (
                        <p
                          key={`${detection.engineName}-${detection.result}`}
                          className="truncate"
                        >
                          <span className="text-foreground">
                            {detection.engineName}:
                          </span>{" "}
                          {detection.result ?? detection.category}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground/80">
                      No engine-specific detections were returned.
                    </p>
                  )}
                </div>
              </div>
            )}
            {effectiveVtUrl && (
              <div className="mt-3">
                <a
                  href={effectiveVtUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-white/90"
                >
                  <ExternalLink className="h-3 w-3" />
                  View full VirusTotal report
                </a>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onClose}
            className={!onDownload && !onRetry ? "col-span-2" : undefined}
          >
            {onDownload ? "Cancel" : "Close"}
          </AlertDialogCancel>
          {onRetry && (
            <AlertDialogAction
              onClick={() => void handleRetry()}
              disabled={retrying}
            >
              {retrying ? "Retrying…" : "Retry scan"}
            </AlertDialogAction>
          )}
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
    case "clean":
      return <ShieldCheck className="h-5 w-5 text-green-500" />
    case "flagged":
      return <ShieldAlert className="h-5 w-5 text-destructive" />
    case "error":
      return <ShieldOff className="h-5 w-5 text-muted-foreground" />
    default:
      return <Spinner size="md" className="text-yellow-500" />
  }
}

function vtDialogHeading(status: VtScanStatus, onDownload?: () => void) {
  switch (status) {
    case "clean":
      return "No threats detected"
    case "flagged":
      return onDownload ? "This file may be unsafe" : "Threats detected"
    case "error":
      return "Scan could not complete"
    case "scanning":
    case "pending":
      return "Scan in progress"
    default:
      return "VirusTotal scan"
  }
}

function vtDialogBody(
  status: VtScanStatus,
  stats: VtScanStats | null,
  total: number | null,
  malicious: number,
  suspicious: number
) {
  switch (status) {
    case "clean":
      return total !== null
        ? `All ${total} security engines found this file safe.`
        : "This file passed all security checks."
    case "flagged": {
      const parts: string[] = []
      if (malicious > 0)
        parts.push(
          `${malicious} engine${malicious !== 1 ? "s" : ""} flagged it as malicious`
        )
      if (suspicious > 0) parts.push(`${suspicious} flagged it as suspicious`)
      return parts.length > 0
        ? parts.join(", ") + "."
        : "One or more security engines flagged this file."
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
