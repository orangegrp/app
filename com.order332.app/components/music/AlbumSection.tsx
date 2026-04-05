"use client"

import { useState } from "react"
import { Music2, Play, Shuffle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMusicContext } from "./MusicContext"
import { useAudioPlayer } from "@/components/ui/audio-player"

interface AlbumInfo {
  name: string
  cover: string | null
  trackCount: number
  firstTrackId: string
}

const MAX_VISIBLE = 5

export function AlbumSection() {
  const { tracks, playAlbum, currentTrackId } = useMusicContext()
  const player = useAudioPlayer()
  const [showAll, setShowAll] = useState(false)

  // Build album map (only tracks with an album field)
  const albumMap = new Map<string, AlbumInfo>()
  for (const t of tracks) {
    if (!t.album) continue
    if (!albumMap.has(t.album)) {
      albumMap.set(t.album, {
        name: t.album,
        cover: t.coverUrl ?? null,
        trackCount: 0,
        firstTrackId: t.id,
      })
    }
    const entry = albumMap.get(t.album)!
    entry.trackCount++
    if (!entry.cover && t.coverUrl) entry.cover = t.coverUrl
  }

  const albums = Array.from(albumMap.values())
  if (albums.length === 0) return null

  const visible = showAll ? albums : albums.slice(0, MAX_VISIBLE)

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[10px] tracking-[0.2em] text-muted-foreground/50">ALBUMS</p>
        {albums.length > MAX_VISIBLE && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAll ? "Show less" : `See all ${albums.length}`}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {visible.map((album) => {
          // Determine if any track in this album is currently active
          const albumTracks = tracks.filter((t) => t.album === album.name)
          const isActive = albumTracks.some((t) => t.id === currentTrackId)
          return (
            <AlbumCard
              key={album.name}
              album={album}
              isActive={isActive}
              isPlaying={isActive && player.isPlaying}
              onPlay={() => playAlbum(album.name, undefined, false)}
              onShuffle={() => playAlbum(album.name, undefined, true)}
            />
          )
        })}
      </div>
    </section>
  )
}

interface AlbumCardProps {
  album: AlbumInfo
  isActive: boolean
  isPlaying: boolean
  onPlay: () => void
  onShuffle: () => void
}

function AlbumCard({ album, isActive, isPlaying, onPlay, onShuffle }: AlbumCardProps) {
  return (
    <div
      className={cn(
        "glass-card group relative flex cursor-pointer flex-col overflow-hidden rounded-xl transition-all",
        isActive && "ring-1 ring-foreground/30",
      )}
      onClick={onPlay}
    >
      {/* Cover */}
      <div className="relative aspect-square overflow-hidden bg-foreground/5">
        {album.cover ? (
          <img
            src={album.cover}
            alt={album.name}
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
            "absolute inset-0 flex items-center justify-center gap-3 bg-black/40 transition-opacity",
            isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-md ring-1 ring-white/20">
            <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
          </div>
        </div>

        {/* Active waveform */}
        {isActive && (
          <div className="absolute bottom-2 left-2">
            <div className="flex items-end gap-0.5 h-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn("w-1 rounded-full bg-white", isPlaying && "animate-bounce")}
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
        <p className="truncate text-sm font-medium text-foreground">{album.name}</p>
        <p className="text-xs text-muted-foreground/60">{album.trackCount} {album.trackCount === 1 ? 'track' : 'tracks'}</p>
      </div>

      {/* Shuffle button */}
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onShuffle() }}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-foreground/80"
          aria-label="Shuffle album"
          title="Shuffle album"
        >
          <Shuffle className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
