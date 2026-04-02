'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export interface FrontmatterData {
  title: string
  description: string
  date: string // YYYY-MM-DD
  author: string
  tags: string[]
  draft: boolean
}

interface Props {
  data: FrontmatterData
  onChange: (partial: Partial<FrontmatterData>) => void
}

export function FrontmatterPanel({ data, onChange }: Props) {
  const [tagInput, setTagInput] = useState('')

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
    </div>
  )
}
