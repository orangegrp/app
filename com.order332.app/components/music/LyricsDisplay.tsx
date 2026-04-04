"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { parseLrc, useLrcSync } from "@/hooks/useLrc"

interface LyricsDisplayProps {
  lyricsContent: string
  lyricsType: "lrc" | "txt"
  /** Called with seek time in seconds when user clicks a synced line. */
  onSeek?: (timeSec: number) => void
}

export function LyricsDisplay({ lyricsContent, lyricsType, onSeek }: LyricsDisplayProps) {
  if (lyricsType === "txt") {
    return <PlainLyrics content={lyricsContent} />
  }
  return <SyncedLyrics content={lyricsContent} onSeek={onSeek} />
}

function PlainLyrics({ content }: { content: string }) {
  return (
    <pre className="whitespace-pre-wrap font-sans text-base leading-8 text-muted-foreground">
      {content}
    </pre>
  )
}

function SyncedLyrics({
  content,
  onSeek,
}: {
  content: string
  onSeek?: (timeSec: number) => void
}) {
  const lines = parseLrc(content)
  const { activeIndex } = useLrcSync(lines)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Scroll active line into the centre of the nearest overflow-y-auto ancestor
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [activeIndex])

  if (lines.length === 0) return <PlainLyrics content={content} />

  return (
    <div className="flex flex-col items-center gap-0.5 py-6 text-center">
      {lines.map((line, i) => {
        const isActive = i === activeIndex
        const isPast = i < activeIndex
        return (
          <button
            key={i}
            ref={isActive ? activeRef : undefined}
            type="button"
            onClick={onSeek ? () => onSeek(line.timeMs / 1000) : undefined}
            className={cn(
              "w-full max-w-2xl px-6 py-2 text-center transition-all duration-300",
              isActive
                ? "scale-[1.05] text-xl font-semibold text-foreground"
                : isPast
                  ? "text-lg text-muted-foreground/35"
                  : "text-lg text-muted-foreground/55",
              onSeek
                ? "cursor-pointer rounded-xl hover:bg-foreground/6 hover:text-foreground/80"
                : "cursor-default",
            )}
          >
            {line.text || <span className="text-muted-foreground/20">·</span>}
          </button>
        )
      })}
    </div>
  )
}
