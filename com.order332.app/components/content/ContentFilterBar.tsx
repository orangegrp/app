"use client"

import { cn } from "@/lib/utils"
import type { ContentItemType } from "@/lib/content-api"

const FILTERS: { label: string; value: ContentItemType | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Images", value: "image" },
  { label: "Audio", value: "audio" },
  { label: "Videos", value: "video" },
  { label: "PDFs", value: "pdf" },
  { label: "Downloads", value: "download" },
]

interface ContentFilterBarProps {
  activeType: ContentItemType | undefined
  onChange: (type: ContentItemType | undefined) => void
}

export function ContentFilterBar({
  activeType,
  onChange,
}: ContentFilterBarProps) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {FILTERS.map(({ label, value }) => (
        <button
          key={label}
          onClick={() => onChange(value)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium tracking-wide transition-all",
            activeType === value
              ? "bg-foreground text-background"
              : "glass-button text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
