'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import { PageBackground } from '@/components/layout/PageBackground'
import { ContentFilterBar } from '@/components/content/ContentFilterBar'
import { ContentGrid } from '@/components/content/ContentGrid'
import { ContentUploadArea } from '@/components/content/ContentUploadArea'
import { FolderBreadcrumb } from '@/components/content/FolderBreadcrumb'
import {
  fetchContentItems,
  fetchContentFolders,
  deleteContentItem,
  pollVtScans,
  type ContentItemMeta,
  type ContentItemType,
  type ContentFolder,
} from '@/lib/content-api'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/lib/auth-store'
import { PERMISSIONS } from '@/lib/permissions'

export default function ContentPage() {
  const user = useAuthStore((s) => s.user)
  const isCreator = user ? hasPermission(user.permissions, PERMISSIONS.APP_CONTENT_UPLOAD) : false

  const router = useRouter()
  const searchParams = useSearchParams()

  const [items, setItems] = useState<ContentItemMeta[]>([])
  const [folders, setFolders] = useState<ContentFolder[]>([])
  const [filter, setFilter] = useState<ContentItemType | undefined>(undefined)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    () => searchParams.get('folder')
  )
  const [isCreatorMode, setIsCreatorMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sync folder navigation to URL
  const navigateFolder = useCallback((id: string | null) => {
    setCurrentFolderId(id)
    setFilter(undefined) // reset filter on folder change
    const params = new URLSearchParams(searchParams.toString())
    if (id) {
      params.set('folder', id)
    } else {
      params.delete('folder')
    }
    router.replace(`/content?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  const loadItems = useCallback(async (folderId: string | null) => {
    try {
      setError(null)
      const { items: fetched } = await fetchContentItems(undefined, folderId)
      setItems(fetched)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load: items + folders in parallel
  useEffect(() => {
    setLoading(true)
    void Promise.all([
      loadItems(currentFolderId),
      fetchContentFolders().then(({ folders: f }) => setFolders(f)).catch(console.error),
    ])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-load items when folder changes (skip initial mount — handled above)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setLoading(true)
    void loadItems(currentFolderId)
  }, [currentFolderId, loadItems])

  // VT scan polling: start/stop based on whether any items are pending
  useEffect(() => {
    const hasPending = items.some(
      (i) => i.vtScanStatus === 'scanning' || i.vtScanStatus === 'pending'
    )

    if (hasPending && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const { stillPending } = await pollVtScans()
          // Re-fetch to get updated statuses
          const { items: refreshed } = await fetchContentItems(undefined, currentFolderId)
          setItems(refreshed)
          if (stillPending === 0) {
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
    () => (filter ? items.filter((i) => i.itemType === filter) : items),
    [items, filter],
  )

  const handleUploadComplete = useCallback((item: ContentItemMeta) => {
    setItems((prev) => [item, ...prev])
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteContentItem(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      console.error('[content] delete error:', err)
    }
  }, [])

  return (
    <div className="page-root relative min-h-screen px-6 pb-32 pt-8 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-6xl">
        <p className="section-label">Content Library</p>

        <div className="mb-8 flex items-start justify-between gap-4">
          <h2 className="text-4xl tracking-widest text-foreground">
            Content Library<span className="blink-cursor">_</span>
          </h2>
          {isCreator && (
            <button
              onClick={() => setIsCreatorMode((v) => !v)}
              className="mt-1 flex shrink-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {isCreatorMode
                ? <ToggleRight className="h-5 w-5 text-foreground" />
                : <ToggleLeft className="h-5 w-5" />}
              Creator mode
            </button>
          )}
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
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
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
            isCreator={isCreatorMode}
            onDelete={handleDelete}
            onNavigateFolder={navigateFolder}
            onFoldersChange={setFolders}
          />
        )}
      </div>
    </div>
  )
}
