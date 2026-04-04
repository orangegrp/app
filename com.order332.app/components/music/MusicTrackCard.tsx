"use client"

import { useState } from "react"
import { Music2, Pause, Play, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration, type MusicTrackMeta } from "@/lib/music-api"

interface MusicTrackCardProps {
  track: MusicTrackMeta
  isActive: boolean
  isPlaying: boolean
  onPlay: () => void
  isCreator: boolean
  onDelete: (id: string) => void
}

export function MusicTrackCard({
  track,
  isActive,
  isPlaying,
  onPlay,
  isCreator,
  onDelete,
}: MusicTrackCardProps) {
  const [deleting, setDeleting] = useState(false)
  const showingPlay = isActive && isPlaying

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete "${track.title}"?`)) return
    setDeleting(true)
    onDelete(track.id)
  }

  return (
    <div
      className={cn(
        "glass-card group relative flex cursor-pointer flex-col overflow-hidden rounded-xl transition-all",
        isActive && "ring-1 ring-foreground/30",
      )}
      onClick={onPlay}
    >
      {/* Cover art */}
      <div className="relative aspect-square overflow-hidden bg-foreground/5">
        {track.coverUrl ? (
          <img
            src={track.coverUrl}
            alt={`${track.title} cover`}
            className={cn(
              "h-full w-full object-cover transition-transform duration-500",
              isActive && "scale-105",
            )}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Music2 className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}

        {/* Play overlay */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity",
            showingPlay ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-md ring-1 ring-white/20">
            {showingPlay
              ? <Pause className="h-5 w-5 fill-white text-white" />
              : <Play className="ml-0.5 h-5 w-5 fill-white text-white" />}
          </div>
        </div>

        {/* Active indicator */}
        {isActive && (
          <div className="absolute bottom-2 left-2">
            <div className="flex items-end gap-0.5 h-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1 rounded-full bg-white",
                    isPlaying && "animate-bounce",
                  )}
                  style={{
                    height: `${Math.random() * 50 + 50}%`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: '0.6s',
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
        <div className="mt-1 flex items-center gap-2">
          {track.genre && (
            <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-xs text-muted-foreground">
              {track.genre}
            </span>
          )}
          <span className="ml-auto text-xs tabular-nums text-muted-foreground/60">
            {formatDuration(track.durationSec)}
          </span>
        </div>
      </div>

      {/* Creator delete button */}
      {isCreator && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/80"
          aria-label="Delete track"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
