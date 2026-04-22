'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Trash2, PlusCircle } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/lib/auth-store'
import { toast } from 'sonner'
import { Spinner } from '../ui/spinner'

export interface FrontmatterData {
  title: string
  description: string
  date: string // YYYY-MM-DD
  author: string
  tags: string[]
  draft: boolean
}

interface StrayImage {
  name: string
  url: string
  size: number | null
}

interface Props {
  data: FrontmatterData
  onChange: (partial: Partial<FrontmatterData>) => void
  onInsertImage?: (url: string) => void
}

export function FrontmatterPanel({ data, onChange, onInsertImage }: Props) {
  const [tagInput, setTagInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [strayImages, setStrayImages] = useState<StrayImage[]>([])
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null)
  const hasMounted = useRef(false)

  const scanStrayImages = useCallback(async () => {
    setScanning(true)
    try {
      const { accessToken } = useAuthStore.getState()
      const res = await fetch('/api/blog/images', {
        headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to fetch images')
      const { images } = (await res.json()) as { images: StrayImage[] }
      setStrayImages(images)
    } catch {
      // silent — stray panel is non-critical
    } finally {
      setScanning(false)
    }
  }, [])

  // Scan on mount
  useEffect(() => {
    if (hasMounted.current) return
    hasMounted.current = true
    void scanStrayImages()
  }, [scanStrayImages])

  const addTag = (raw: string) => {
    const parts = raw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && !data.tags.includes(t))
    if (parts.length > 0) {
      onChange({ tags: [...data.tags, ...parts] })
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    onChange({ tags: data.tags.filter((t) => t !== tag) })
  }

  const deleteStrayImage = async (url: string) => {
    setDeletingUrl(url)
    try {
      const { accessToken } = useAuthStore.getState()
      const res = await fetch('/api/blog/images', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ url }),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Delete failed')
      setStrayImages((prev) => prev.filter((img) => img.url !== url))
    } catch {
      toast.error('Could not delete image')
    } finally {
      setDeletingUrl(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <p className="card-label text-xs">Frontmatter</p>

      <div className="flex flex-col gap-1">
        <Label className="text-xs tracking-wide text-muted-foreground">Title</Label>
        <input
          type="text"
          value={data.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
          placeholder="Post title"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs tracking-wide text-muted-foreground">Description</Label>
        <textarea
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={2}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20 resize-none"
          placeholder="Short description"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs tracking-wide text-muted-foreground">Date</Label>
        <input
          type="date"
          value={data.date}
          onChange={(e) => onChange({ date: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs tracking-wide text-muted-foreground">Author</Label>
        <input
          type="text"
          value={data.author}
          onChange={(e) => onChange({ author: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
          placeholder="author"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs tracking-wide text-muted-foreground">Tags</Label>
        <div className="flex flex-wrap gap-1 min-h-[2rem]">
          {data.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-xs tracking-wide text-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`Remove tag ${tag}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addTag(tagInput)
            }
          }}
          onBlur={() => tagInput && addTag(tagInput)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
          placeholder="Add tags, press Enter"
        />
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
        <Label htmlFor="draft-toggle" className="text-sm tracking-wide cursor-pointer select-none">
          Draft
        </Label>
        <Switch
          id="draft-toggle"
          checked={data.draft}
          onCheckedChange={(checked) => onChange({ draft: checked })}
        />
      </div>

      {/* ── Stray image assets ── */}
      <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs tracking-wide text-muted-foreground flex-1">Unused CDN Images</Label>
          {scanning && <Spinner size="xs" className="text-muted-foreground/60" />}
        </div>

        {!scanning && strayImages.length === 0 && (
          <p className="text-xs text-muted-foreground/50">No stray images.</p>
        )}

        {strayImages.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {strayImages.map((img) => (
              <div
                key={img.url}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.name}
                  className="h-10 w-10 rounded object-cover shrink-0 bg-white/5"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={img.name}>
                  {img.name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {onInsertImage && (
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const p = new URL(img.url)
                          if (p.protocol === 'https:' || p.protocol === 'http:') {
                            onInsertImage(img.url)
                          }
                        } catch { /* invalid URL, no-op */ }
                      }}
                      title="Insert into post"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                    >
                      <PlusCircle size={11} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { void deleteStrayImage(img.url) }}
                    disabled={deletingUrl === img.url}
                    title="Delete from CDN"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {deletingUrl === img.url ? (
                      <Spinner size="md" clockwise />
                    ) : (
                      <Trash2 size={11} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
