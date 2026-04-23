"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ToggleLeft, ToggleRight } from "lucide-react"
import { PageBackground } from "@/components/layout/PageBackground"
import { ContentFilterBar } from "@/components/content/ContentFilterBar"
import { ContentGrid } from "@/components/content/ContentGrid"
import { ContentUploadArea } from "@/components/content/ContentUploadArea"
import { FolderBreadcrumb } from "@/components/content/FolderBreadcrumb"
import {
  fetchContentItems,
  fetchContentFolders,
  deleteContentItem,
  moveContentItem,
  pollVtScans,
  pollVideoProcessing,
  normalizeContentItemType,
  type ContentItemMeta,
  type ContentItemType,
  type ContentFolder,
} from "@/lib/content-api"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/lib/auth-store"
import { PERMISSIONS } from "@/lib/permissions"
import { Spinner } from "@/components/ui/spinner"

export default function ContentPage() {
  const user = useAuthStore((s) => s.user)
  const isCreator = user
    ? hasPermission(user.permissions, PERMISSIONS.APP_CONTENT_UPLOAD)
    : false

  const router = useRouter()
  const searchParams = useSearchParams()

  const [items, setItems] = useState<ContentItemMeta[]>([])
  const [folders, setFolders] = useState<ContentFolder[]>([])
  const [filter, setFilter] = useState<ContentItemType | undefined>(undefined)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(() =>
    searchParams.get("folder")
  )
  const [sharedItemId, setSharedItemId] = useState<string | null>(() =>
    searchParams.get("item")
  )
  const [isCreatorMode, setIsCreatorMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sync folder navigation to URL
  const navigateFolder = useCallback(
    (id: string | null) => {
      setCurrentFolderId(id)
      setFilter(undefined) // reset filter on folder change
      const params = new URLSearchParams(searchParams.toString())
      if (id) {
        params.set("folder", id)
      } else {
        params.delete("folder")
      }
      router.replace(`/content?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const handleSharedItemHandled = useCallback(() => {
    setSharedItemId(null)
    const params = new URLSearchParams(searchParams.toString())
    params.delete("item")
    router.replace(`/content?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  const loadItems = useCallback(async (folderId: string | null) => {
    try {
      setError(null)
      const { items: fetched } = await fetchContentItems(undefined, folderId)
      setItems(fetched)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content")
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load: items + folders in parallel
  useEffect(() => {
    setLoading(true)
    void Promise.all([
      loadItems(currentFolderId),
      fetchContentFolders()
        .then(({ folders: f }) => setFolders(f))
        .catch(console.error),
    ])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-load items when folder changes (skip initial mount — handled above)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setLoading(true)
    void loadItems(currentFolderId)
  }, [currentFolderId, loadItems])

  // Poll background processing (VT scans + video transcodes)
  useEffect(() => {
    const hasPendingScans = items.some(
      (i) => i.vtScanStatus === "scanning" || i.vtScanStatus === "pending"
    )
    const hasProcessingVideos = items.some(
      (i) => i.itemType === "video" && i.videoStatus === "processing"
    )
    const hasPending = hasPendingScans || hasProcessingVideos

    if (hasPending && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const results = await Promise.allSettled([
            pollVtScans(),
            pollVideoProcessing(),
          ])
          const vtPending =
            results[0].status === "fulfilled"
              ? results[0].value.stillPending
              : 0
          const videoPending =
            results[1].status === "fulfilled"
              ? results[1].value.stillPending
              : 0

          // Re-fetch to get updated statuses
          const { items: refreshed } = await fetchContentItems(
            undefined,
            currentFolderId
          )
          setItems(refreshed)
          if (vtPending + videoPending === 0) {
            clearInterval(pollIntervalRef.current!)
            pollIntervalRef.current = null
          }
        } catch {
          // Best-effort — don't crash the UI on poll failure
        }
      }, 30_000)
    } else if (!hasPending && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [items, currentFolderId])

  const filteredItems = useMemo(
    () =>
      filter
        ? items.filter(
            (i) => normalizeContentItemType(i.itemType, i.mimeType) === filter
          )
        : items,
    [items, filter]
  )

  const handleUploadComplete = useCallback((item: ContentItemMeta) => {
    setItems((prev) => [item, ...prev])
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteContentItem(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      console.error("[content] delete error:", err)
    }
  }, [])

  const handleUpdate = useCallback((item: ContentItemMeta) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)))
  }, [])

  const handleMove = useCallback(
    async (itemId: string, folderId: string | null) => {
      // Optimistically remove from current view (item is moving to a different folder)
      setItems((prev) => prev.filter((i) => i.id !== itemId))
      try {
        await moveContentItem(itemId, folderId)
      } catch (err) {
        console.error("[content] move error:", err)
        // Re-fetch on failure to restore correct state
        void loadItems(currentFolderId)
      }
    },
    [currentFolderId, loadItems]
  )

  return (
    <div className="page-root relative min-h-screen px-6 pt-8 pb-32 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-6xl">
        <p className="section-label">Content Library</p>

        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center">
            <h2 className="flex items-center text-4xl tracking-widest text-foreground">
              Content Library<span className="blink-cursor">_</span>
            </h2>
          </div>
          {isCreator && (
            <button
              onClick={() => setIsCreatorMode((v) => !v)}
              className="mt-1 flex shrink-0 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {isCreatorMode ? (
                <ToggleRight className="h-5 w-5 text-foreground" />
              ) : (
                <ToggleLeft className="h-5 w-5" />
              )}
              Creator mode
            </button>
          )}
        </div>

        <div className="mb-10 flex items-start gap-3 rounded-2xl border border-blue-500/30 bg-blue-400/10 px-5 py-4 backdrop-blur-md">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-blue-400/80"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <p className="card-label mb-1 text-blue-400/80">Disclaimer</p>
            <p className="text-xs leading-relaxed tracking-wider text-blue-200/60">
              Uploaded files are automatically scanned for malware and other
              threats using multiple engines powered by VirusTotal. However,
              absolute safety cannot be guaranteed.
              <br />
              <span className="font-medium text-blue-300/80">
                Be cautious
              </span>{" "}
              when downloading or opening content, especially if the file has
              been flagged. Always follow best security practices when studying
              malware or downloading untrusted content.
            </p>
            <p className="mt-2 text-xs leading-relaxed font-bold tracking-wider text-blue-200/60">
              Neither 332 nor the operator of this service is or can be held
              responsible for any damage or loss associated with any content on
              this service.
            </p>
          </div>
        </div>

        <FolderBreadcrumb
          folders={folders}
          currentFolderId={currentFolderId}
          onNavigate={navigateFolder}
        />

        {isCreatorMode && (
          <ContentUploadArea
            onUploadComplete={handleUploadComplete}
            currentFolderId={currentFolderId}
          />
        )}

        <ContentFilterBar activeType={filter} onChange={setFilter} />

        {loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <Spinner size="md" clockwise />
          </div>
        ) : error ? (
          <div className="glass-card rounded-2xl p-8">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : (
          <ContentGrid
            items={filteredItems}
            folders={folders}
            currentFolderId={currentFolderId}
            sharedItemId={sharedItemId}
            isCreator={isCreatorMode}
            onDelete={handleDelete}
            onUpdate={handleUpdate}
            onMove={handleMove}
            onNavigateFolder={navigateFolder}
            onFoldersChange={setFolders}
            onSharedItemHandled={handleSharedItemHandled}
          />
        )}
      </div>
    </div>
  )
}
