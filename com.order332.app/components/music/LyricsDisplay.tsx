"use client"

import { useEffect, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"
import { parseLrc, useLrcSync } from "@/hooks/useLrc"

interface LyricsDisplayProps {
  lyricsContent: string
  lyricsType: "lrc" | "txt"
  transliteratedLyricsContent?: string | null
  transliteratedLyricsType?: "lrc" | "txt"
  /** Called with seek time in seconds when user clicks a synced line. */
  onSeek?: (timeSec: number) => void
}

export function LyricsDisplay({
  lyricsContent,
  lyricsType,
  transliteratedLyricsContent,
  transliteratedLyricsType,
  onSeek,
}: LyricsDisplayProps) {
  if (lyricsType === "txt") {
    return <PlainLyrics content={lyricsContent} />
  }
  return (
    <SyncedLyrics
      content={lyricsContent}
      transliteratedContent={
        transliteratedLyricsType === "lrc" ? transliteratedLyricsContent : null
      }
      onSeek={onSeek}
    />
  )
}

function PlainLyrics({ content }: { content: string }) {
  return (
    <pre className="font-sans text-base leading-8 whitespace-pre-wrap text-muted-foreground">
      {content}
    </pre>
  )
}

function SyncedLyrics({
  content,
  transliteratedContent,
  onSeek,
}: {
  content: string
  transliteratedContent?: string | null
  onSeek?: (timeSec: number) => void
}) {
  const lines = useMemo(() => parseLrc(content), [content])
  const transliteratedLines = useMemo(
    () => (transliteratedContent ? parseLrc(transliteratedContent) : []),
    [transliteratedContent]
  )
  const transliteratedByTime = useMemo(() => {
    const map = new Map<number, string>()
    for (const line of transliteratedLines) {
      if (!map.has(line.timeMs)) map.set(line.timeMs, line.text)
    }
    return map
  }, [transliteratedLines])
  const { activeIndex } = useLrcSync(lines)
  // Scroll anchor is a non-focusable <span> so scrollIntoView never steals focus
  const activeRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [activeIndex])

  if (lines.length === 0) return <PlainLyrics content={content} />

  return (
    <div
      className="flex flex-col items-center gap-0.5 py-6 text-center"
      style={{ fontFamily: "Pixellari, VT323, monospace" }}
    >
      {lines.map((line, i) => {
        const isActive = i === activeIndex
        const isPast = i < activeIndex
        return (
          <button
            key={i}
            type="button"
            onClick={onSeek ? () => onSeek(line.timeMs / 1000) : undefined}
            className={cn(
              "w-full max-w-2xl px-6 py-2 text-center text-xl font-semibold transition-all duration-300",
              isActive
                ? "scale-[1.05] text-foreground"
                : isPast
                  ? "text-muted-foreground/35"
                  : "text-muted-foreground/55",
              onSeek
                ? "cursor-pointer hover:text-foreground/80"
                : "cursor-default"
            )}
          >
            {/* Non-focusable scroll anchor — must not be a button/input */}
            <span ref={isActive ? activeRef : undefined} aria-hidden="true" />
            <span className="block">
              {line.text || <span className="text-muted-foreground/20">·</span>}
            </span>
            {transliteratedContent && (
              <span
                className={cn(
                  "mt-0.5 block text-sm leading-6 font-normal",
                  isActive
                    ? "text-foreground"
                    : isPast
                      ? "text-muted-foreground/35"
                      : "text-muted-foreground/75"
                )}
              >
                {transliteratedByTime.get(line.timeMs) ??
                  transliteratedLines[i]?.text ??
                  ""}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
