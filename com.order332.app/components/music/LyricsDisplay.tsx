"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { parseLrc, useLrcSync } from "@/hooks/useLrc"
import { useAudioPlayerTime } from "@/components/ui/audio-player"

interface LyricsDisplayProps {
  lyricsContent: string
  lyricsType: "lrc" | "txt"
}

export function LyricsDisplay({ lyricsContent, lyricsType }: LyricsDisplayProps) {
  if (lyricsType === "txt") {
    return <PlainLyrics content={lyricsContent} />
  }
  return <SyncedLyrics content={lyricsContent} />
}

function PlainLyrics({ content }: { content: string }) {
  return (
    <div className="max-h-64 overflow-y-auto">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
        {content}
      </pre>
    </div>
  )
}

function SyncedLyrics({ content }: { content: string }) {
  const lines = parseLrc(content)
  const { activeIndex } = useLrcSync(lines)
  const activeRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [activeIndex])

  if (lines.length === 0) {
    return <PlainLyrics content={content} />
  }

  return (
    <div className="max-h-64 overflow-hidden text-center">
      <div className="flex flex-col items-center gap-2 py-4">
        {lines.map((line, i) => {
          const isActive = i === activeIndex
          const isPast = i < activeIndex
          return (
            <p
              key={i}
              ref={isActive ? activeRef : undefined}
              className={cn(
                "max-w-sm px-4 py-0.5 text-sm leading-relaxed transition-all duration-300",
                isActive
                  ? "scale-105 font-medium text-foreground"
                  : isPast
                    ? "text-muted-foreground/40"
                    : "text-muted-foreground/60",
              )}
            >
              {line.text || <span className="text-muted-foreground/20">·</span>}
            </p>
          )
        })}
      </div>
    </div>
  )
}
