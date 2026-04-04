"use client"

import { AudioPlayerProvider } from "@/components/ui/audio-player"
import { ContentItemCard } from "./ContentItemCard"
import type { ContentItemMeta } from "@/lib/content-api"

interface ContentGridProps {
  items: ContentItemMeta[]
  isCreator: boolean
  onDelete: (id: string) => void
}

export function ContentGrid({ items, isCreator, onDelete }: ContentGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-foreground/10">
        <p className="text-sm text-muted-foreground tracking-wider">No content yet.</p>
      </div>
    )
  }

  return (
    <AudioPlayerProvider>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <ContentItemCard
            key={item.id}
            item={item}
            isCreator={isCreator}
            onDelete={onDelete}
          />
        ))}
      </div>
    </AudioPlayerProvider>
  )
}
