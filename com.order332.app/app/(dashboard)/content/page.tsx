'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import { PageBackground } from '@/components/layout/PageBackground'
import { ContentFilterBar } from '@/components/content/ContentFilterBar'
import { ContentGrid } from '@/components/content/ContentGrid'
import { ContentUploadArea } from '@/components/content/ContentUploadArea'
import { fetchContentItems, deleteContentItem, type ContentItemMeta, type ContentItemType } from '@/lib/content-api'
import { hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/lib/auth-store'
import { PERMISSIONS } from '@/lib/permissions'

export default function ContentPage() {
  const user = useAuthStore((s) => s.user)
  const isCreator = user ? hasPermission(user.permissions, PERMISSIONS.APP_CONTENT_UPLOAD) : false

  const [items, setItems] = useState<ContentItemMeta[]>([])
  const [filter, setFilter] = useState<ContentItemType | undefined>(undefined)
  const [isCreatorMode, setIsCreatorMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    try {
      setError(null)
      const { items: fetched } = await fetchContentItems()
      setItems(fetched)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadItems() }, [loadItems])

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

        {isCreatorMode && (
          <ContentUploadArea onUploadComplete={handleUploadComplete} />
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
            isCreator={isCreatorMode}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  )
}
