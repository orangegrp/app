"use client"

import { useEffect, useState } from "react"
import { Download, Eye, File, Shield, Video, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { VideoPlayerAdaptive } from "@/components/ui/VideoPlayerAdaptive"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  fetchSharedContentDownloadUrl,
  fetchSharedContentVideoSource,
  formatFileSize,
} from "@/lib/content-api"
import { useAuthStore } from "@/lib/auth-store"
import { isPWAContext } from "@/lib/pwa"

interface ContentSharePageClientProps {
  token: string
  mode: "internal" | "external"
  expiresAt: string | null
  item: {
    id: string
    itemType: "image" | "audio" | "pdf" | "download" | "video"
    title: string
    description: string | null
    fileSize: number
    width: number | null
    height: number | null
  }
  internalPath: string
}

export function ContentSharePageClient({
  token,
  mode,
  expiresAt,
  item,
  internalPath,
}: ContentSharePageClientProps) {
  const router = useRouter()
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(
    mode === "internal" || mode === "external"
  )
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const isChromiumBrowser =
    typeof navigator !== "undefined" &&
    /(Chrome|CriOS|Edg|OPR)/.test(navigator.userAgent) &&
    !/Firefox/i.test(navigator.userAgent)

  const refreshAndStoreAuth = async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPwa: isPWAContext() }),
        credentials: "include",
      })
      if (!res.ok) return false
      try {
        const { accessToken } = (await res.json()) as {
          accessToken: string
        }
        const [, b64] = accessToken.split(".")
        const payload = JSON.parse(
          atob(b64.replace(/-/g, "+").replace(/_/g, "/"))
        ) as { sub: string; permissions: string; isPwa: boolean }
        useAuthStore.getState().setAuth(accessToken, {
          id: payload.sub,
          permissions: payload.permissions,
          isPwa: payload.isPwa,
        })
      } catch {
        // ignore token parse issues; successful refresh is enough for redirect
      }
      return true
    } catch {
      return false
    }
  }

  useEffect(() => {
    if (mode === "external") {
      void refreshAndStoreAuth()
        .then((isLoggedIn) => {
          if (isLoggedIn) {
            router.replace(internalPath)
            return
          }
          if (item.itemType !== "video") {
            setLoading(false)
          }
        })
        .catch(() => {
          if (item.itemType !== "video") {
            setLoading(false)
          }
        })
      return
    }

    void refreshAndStoreAuth()
      .then((isLoggedIn) => {
        if (isLoggedIn) {
          router.replace(internalPath)
        } else {
          router.replace(`/login?redirect=${encodeURIComponent(internalPath)}`)
        }
      })
      .catch(() => {
        router.replace(`/login?redirect=${encodeURIComponent(internalPath)}`)
      })
      .finally(() => setLoading(false))
  }, [internalPath, item.itemType, mode, router])

  useEffect(() => {
    if (mode !== "external" || item.itemType !== "video") return

    fetchSharedContentVideoSource(token)
      .then(({ url }) => setVideoUrl(url))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load video")
      })
      .finally(() => setLoading(false))
  }, [item.itemType, mode, token])

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    try {
      const { url } = await fetchSharedContentDownloadUrl(token)
      window.location.assign(url)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to prepare download"
      )
    } finally {
      setDownloading(false)
    }
  }

  const handlePdfPreview = async () => {
    setPdfDialogOpen(true)
    if (pdfPreviewUrl) return
    setPdfPreviewLoading(true)
    setError(null)
    try {
      const { url } = await fetchSharedContentDownloadUrl(token)
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to load PDF preview")
      const blob = await res.blob()
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(blob)
      })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load PDF preview"
      )
    } finally {
      setPdfPreviewLoading(false)
    }
  }

  useEffect(() => {
    if (mode !== "external" || item.itemType !== "pdf") return
    return () => {
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [item.itemType, mode])

  const modeLabel = mode === "internal" ? "Internal Share" : "External Share"
  const expiryLabel = expiresAt
    ? `Expires ${new Date(expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}`
    : "Never expires"

  if (mode === "internal" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-card w-full max-w-sm rounded-2xl px-8 py-8 text-center">
          <Shield className="mx-auto mb-4 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {mode === "external"
              ? "Checking session and redirecting…"
              : "Preparing shared content…"}
          </p>
        </div>
      </div>
    )
  }

  if (item.itemType === "video") {
    const aspectRatio =
      item.width && item.height && item.width > 0 && item.height > 0
        ? `${item.width} / ${item.height}`
        : "16 / 9"

    return (
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10">
        <div className="glass-card w-full rounded-2xl p-3 sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] tracking-widest text-muted-foreground">
            <span className="rounded-full border border-foreground/15 bg-foreground/6 px-2 py-1">
              {modeLabel}
            </span>
            <span className="rounded-full border border-foreground/15 bg-foreground/6 px-2 py-1">
              {expiryLabel}
            </span>
          </div>
          <div className="mb-4 flex items-center gap-2 text-xs tracking-widest text-muted-foreground">
            <Video className="h-3.5 w-3.5" />
            SHARED VIDEO
          </div>
          <p className="mb-1 truncate text-xl font-semibold text-foreground">
            {item.title}
          </p>
          {item.description && (
            <p className="mb-4 text-sm text-muted-foreground">
              {item.description}
            </p>
          )}
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : videoUrl ? (
            <div
              style={{ aspectRatio }}
              className="w-full overflow-hidden rounded-xl"
            >
              <VideoPlayerAdaptive
                src={videoUrl}
                title={item.title}
                className="h-full w-full"
                autoPlay
              />
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass-card w-full max-w-xl rounded-2xl p-6 sm:p-8">
        <div className="mb-3 flex items-center gap-2 text-[10px] tracking-widest text-muted-foreground">
          <span className="rounded-full border border-foreground/15 bg-foreground/6 px-2 py-1">
            {modeLabel}
          </span>
          <span className="rounded-full border border-foreground/15 bg-foreground/6 px-2 py-1">
            {expiryLabel}
          </span>
        </div>
        <div className="mb-4 flex items-center gap-2 text-xs tracking-widest text-muted-foreground">
          <File className="h-3.5 w-3.5" />
          SHARED FILE
        </div>
        <p className="truncate text-xl font-semibold text-foreground">
          {item.title}
        </p>
        {item.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {item.description}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {formatFileSize(item.fileSize)}
        </p>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {item.itemType === "pdf" && (
            <button
              onClick={() => void handlePdfPreview()}
              disabled={pdfPreviewLoading}
              className="glass-button glass-button-ghost inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm"
            >
              <Eye className="h-4 w-4" />
              {pdfPreviewLoading ? "Loading preview…" : "Preview PDF"}
            </button>
          )}
          <button
            onClick={() => void handleDownload()}
            disabled={downloading}
            className="glass-button glass-button-glass inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Preparing download…" : "Download file"}
          </button>
        </div>
      </div>

      {item.itemType === "pdf" && (
        <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
          <DialogContent
            showCloseButton={false}
            style={{
              width: "100dvw",
              maxWidth: "100dvw",
              height: "100dvh",
              maxHeight: "100dvh",
            }}
            className="rounded-none p-2 sm:p-3"
          >
            <DialogTitle className="sr-only">{item.title}</DialogTitle>
            <DialogClose
              className="glass-button glass-button-ghost absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full text-white/95 hover:text-white"
              aria-label="Close PDF preview"
            >
              <X className="h-4 w-4" />
            </DialogClose>
            <div className="h-full w-full overflow-hidden rounded-lg bg-black/20">
              {pdfPreviewLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner size="md" clockwise />
                </div>
              ) : pdfPreviewUrl ? (
                isChromiumBrowser ? (
                  <iframe
                    src={`${pdfPreviewUrl}#toolbar=1&navpanes=0&view=FitH`}
                    title={item.title}
                    className="h-full w-full"
                  />
                ) : (
                  <object
                    data={pdfPreviewUrl}
                    type="application/pdf"
                    className="h-full w-full"
                  >
                    <iframe
                      src={`${pdfPreviewUrl}#toolbar=1&navpanes=0&view=FitH`}
                      title={item.title}
                      className="h-full w-full"
                    />
                  </object>
                )
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  PDF preview is unavailable.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
