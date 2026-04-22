"use client"

import { cn } from "@/lib/utils"
import {
  formatGenreSegment,
  parseGenreSegments,
} from "@/lib/music-genre"

type FormattedGenreProps = {
  genre: string | null | undefined
  className?: string
  /** Applied to each tag chip */
  tagClassName?: string
}

/**
 * Renders genre as separate chips, splitting on `,` and `;` in the stored value.
 */
export function FormattedGenre({
  genre,
  className,
  tagClassName,
}: FormattedGenreProps) {
  const segments = parseGenreSegments(genre).map(formatGenreSegment)
  if (segments.length === 0) return null

  return (
    <span
      className={cn(
        "inline-flex max-w-full flex-wrap items-center justify-center gap-1.5",
        className,
      )}
    >
      {segments.map((seg, i) => (
        <span
          key={`${i}-${seg.slice(0, 12)}`}
          className={cn(
            "genre-segment inline-block max-w-full rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs text-muted-foreground",
            tagClassName,
          )}
        >
          {seg}
        </span>
      ))}
    </span>
  )
}
