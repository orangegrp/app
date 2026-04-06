"use client"

import { useRef, useState } from "react"
import { ListEnd, ListStart, Music2, Pencil, Play, Shuffle } from "lucide-react"
import {
  type MusicTrackMeta,
  updateMusicTrack,
  uploadMusicTrackAsset,
  formatDuration,
} from "@/lib/music-api"
import { cn } from "@/lib/utils"
import { useMusicContext } from "./MusicContext"
import { useAudioPlayer } from "@/components/ui/audio-player"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface AlbumInfo {
  name: string
  cover: string | null
  trackCount: number
  firstTrackId: string
}

const MAX_VISIBLE = 5
const WAVEFORM_HEIGHTS = [78, 62, 88]
const SMALL_TILE_BUTTON_CLASS =
  "glass-button glass-button-glass flex h-7 w-7 items-center justify-center rounded-full border-white/20 bg-white/14 text-white backdrop-blur-xl shadow-[0_8px_22px_rgba(0,0,0,0.35)] hover:bg-white/20"
const DETAIL_ACTION_BUTTON_CLASS =
  "glass-button glass-button-ghost flex h-9 w-9 items-center justify-center rounded-full p-0 disabled:opacity-40"
const DETAIL_ACTION_PRIMARY_BUTTON_CLASS =
  "glass-button glass-button-ghost flex h-10 w-10 items-center justify-center rounded-full p-0 disabled:opacity-40"

export function AlbumSection() {
  const { tracks, playAlbum, currentTrackId, isCreatorMode, updateTrack } =
    useMusicContext()
  const player = useAudioPlayer()
  const [showAll, setShowAll] = useState(false)
  const [detailAlbum, setDetailAlbum] = useState<string | null>(null)

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
        <p className="text-[10px] tracking-[0.2em] text-muted-foreground/50">
          ALBUMS
        </p>
        {albums.length > MAX_VISIBLE && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
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
              onShowDetail={() => setDetailAlbum(album.name)}
              tracks={albumTracks}
              canEditCover={isCreatorMode}
              onUpdateTrack={updateTrack}
            />
          )
        })}
      </div>

      {/* Album detail modal */}
      {detailAlbum && (
        <AlbumDetailModal
          albumName={detailAlbum}
          tracks={tracks.filter((t) => t.album === detailAlbum)}
          onClose={() => setDetailAlbum(null)}
          onPlay={(id) => {
            playAlbum(detailAlbum, id, false)
            setDetailAlbum(null)
          }}
          onPlayAll={() => {
            playAlbum(detailAlbum, undefined, false)
            setDetailAlbum(null)
          }}
          onShuffle={() => {
            playAlbum(detailAlbum, undefined, true)
            setDetailAlbum(null)
          }}
        />
      )}
    </section>
  )
}

interface AlbumCardProps {
  album: AlbumInfo
  isActive: boolean
  isPlaying: boolean
  onPlay: () => void
  onShuffle: () => void
  onShowDetail: () => void
  tracks: MusicTrackMeta[]
  canEditCover: boolean
  onUpdateTrack: (track: MusicTrackMeta) => void
}

function AlbumCard({
  album,
  isActive,
  isPlaying,
  onPlay,
  onShuffle,
  onShowDetail,
  tracks,
  canEditCover,
  onUpdateTrack,
}: AlbumCardProps) {
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [updatingCover, setUpdatingCover] = useState(false)

  const handleCoverUpdate = async (file: File) => {
    if (tracks.length === 0) return
    setUpdatingCover(true)
    try {
      const upload = await uploadMusicTrackAsset("covers", file)
      const updatedTracks = await Promise.all(
        tracks.map((track) =>
          updateMusicTrack(track.id, {
            title: track.title,
            artist: track.artist,
            album: track.album ?? null,
            genre: track.genre ?? null,
            coverKey: upload.storageKey,
          })
        )
      )
      updatedTracks.forEach(({ track }) => onUpdateTrack(track))
    } catch (err) {
      console.error("[AlbumSection] cover update error", err)
    } finally {
      setUpdatingCover(false)
    }
  }

  return (
    <div
      className={cn(
        "glass-card group relative flex flex-col overflow-hidden rounded-xl transition-all select-none",
        isActive && "ring-1 ring-foreground/30"
      )}
    >
      {/* Cover */}
      <div
        className="relative aspect-square cursor-pointer overflow-hidden bg-foreground/5"
        onClick={onShowDetail}
      >
        {album.cover ? (
          <img
            src={album.cover}
            alt={album.name}
            className={cn(
              "h-full w-full object-cover transition-transform duration-500",
              isActive && "scale-105"
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
            isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPlay()
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/18 shadow-[0_18px_36px_rgba(0,0,0,0.35)] ring-1 ring-white/30 backdrop-blur-xl hover:bg-white/24"
            aria-label="Play album"
          >
            <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
          </button>
        </div>

        {/* Active waveform */}
        {isActive && (
          <div className="absolute bottom-2 left-2">
            <div className="flex h-4 items-end gap-0.5">
              {WAVEFORM_HEIGHTS.map((height, i) => (
                <div
                  key={height}
                  className={cn(
                    "w-1 rounded-full bg-white",
                    isPlaying && "animate-bounce"
                  )}
                  style={{
                    height: `${height}%`,
                    animationDelay: `${(i + 1) * 0.1}s`,
                    animationDuration: "0.6s",
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div
        className="flex cursor-pointer flex-col gap-0.5 px-3 py-2.5"
        onClick={onShowDetail}
        role="button"
        style={{ cursor: "pointer" }}
      >
        <p className="truncate text-sm font-medium text-foreground">
          {album.name}
        </p>
        <p className="text-xs text-muted-foreground/60">
          {album.trackCount} {album.trackCount === 1 ? "track" : "tracks"}
        </p>
        <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-muted-foreground/70">
          {tracks.slice(0, 4).map((track) => (
            <span key={track.id} className="truncate">
              {track.title}
            </span>
          ))}
          {tracks.length > 4 && (
            <span className="truncate text-[10px] text-muted-foreground/50">
              +{tracks.length - 4} more
            </span>
          )}
        </div>
      </div>

      {/* Shuffle button */}
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onShuffle()
          }}
          className={SMALL_TILE_BUTTON_CLASS}
          aria-label="Shuffle album"
          title="Shuffle album"
        >
          <Shuffle className="h-3 w-3" />
        </button>
      </div>
      {canEditCover && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!updatingCover) coverInputRef.current?.click()
            }}
            className={`${SMALL_TILE_BUTTON_CLASS} absolute top-2 left-2 opacity-0 transition group-hover:opacity-100`}
            aria-label="Edit album art"
            title="Edit album art"
            disabled={updatingCover}
          >
            <Pencil className="h-3 w-3" />
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleCoverUpdate(file)
              event.target.value = ""
            }}
          />
        </>
      )}
    </div>
  )
}

// ── Album detail modal ─────────────────────────────────────────────────────

interface AlbumDetailModalProps {
  albumName: string
  tracks: MusicTrackMeta[]
  onClose: () => void
  onPlay: (trackId: string) => void
  onPlayAll: () => void
  onShuffle: () => void
}

function AlbumDetailModal({
  albumName,
  tracks,
  onClose,
  onPlay,
  onPlayAll,
  onShuffle,
}: AlbumDetailModalProps) {
  const { addTracksToQueue, addTracksAsPlayNext } = useMusicContext()
  const trackIds = tracks.map((t) => t.id)
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[80vh] flex-col select-none"
      >
        <DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate">{albumName}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground/80">
                {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onPlayAll()}
                disabled={tracks.length === 0}
                className={DETAIL_ACTION_PRIMARY_BUTTON_CLASS}
                aria-label="Play album"
                title="Play album"
              >
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              </button>
              <button
                onClick={() => onShuffle()}
                disabled={tracks.length === 0}
                className={DETAIL_ACTION_BUTTON_CLASS}
                aria-label="Shuffle album"
                title="Shuffle album"
              >
                <Shuffle className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  addTracksAsPlayNext(trackIds)
                  onClose()
                }}
                disabled={tracks.length === 0}
                className={DETAIL_ACTION_BUTTON_CLASS}
                aria-label="Play album next"
                title="Play album next"
              >
                <ListStart className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  addTracksToQueue(trackIds)
                  onClose()
                }}
                disabled={tracks.length === 0}
                className={DETAIL_ACTION_BUTTON_CLASS}
                aria-label="Add album to queue"
                title="Add album to queue"
              >
                <ListEnd className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {tracks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground/60">
              No tracks in this album.
            </p>
          ) : (
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {tracks.map((track, i) => (
                <button
                  key={track.id}
                  onClick={() => onPlay(track.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <span className="w-5 shrink-0 text-xs text-muted-foreground/50 tabular-nums">
                    {i + 1}
                  </span>
                  {track.coverUrl ? (
                    <img
                      src={track.coverUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-foreground/5">
                      <Music2 className="h-4 w-4 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {track.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {track.artist}
                    </p>
                  </div>
                  {track.durationSec && (
                    <span className="shrink-0 text-xs text-muted-foreground/50 tabular-nums">
                      {formatDuration(track.durationSec)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
