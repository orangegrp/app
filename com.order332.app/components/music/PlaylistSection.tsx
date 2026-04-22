"use client"

import { type DragEvent, useCallback, useEffect, useRef, useState } from "react"
import {
  ChevronRight,
  GripVertical,
  ImagePlus,
  ListEnd,
  ListStart,
  Music2,
  Pencil,
  Play,
  Plus,
  Shuffle,
  Trash2,
} from "lucide-react"
import {
  fetchMusicPlaylist,
  reorderPlaylistTracks,
  type MusicPlaylistMeta,
  updateMusicTrack,
  uploadMusicTrackAsset,
} from "@/lib/music-api"
import { useMusicContext } from "./MusicContext"
import { useAuthStore } from "@/lib/auth-store"
import { moveItem } from "@/lib/music-queue"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "../ui/spinner"

const SMALL_TILE_BUTTON_CLASS =
  "glass-button glass-button-glass flex h-7 w-7 items-center justify-center rounded-full border-white/20 bg-white/14 text-white backdrop-blur-xl shadow-[0_8px_22px_rgba(0,0,0,0.35)] hover:bg-white/20"
const DETAIL_ACTION_BUTTON_CLASS =
  "glass-button glass-button-ghost flex h-9 w-9 items-center justify-center rounded-full p-0 disabled:opacity-40"
const DETAIL_ACTION_PRIMARY_BUTTON_CLASS =
  "glass-button glass-button-ghost flex h-10 w-10 items-center justify-center rounded-full p-0 disabled:opacity-40"

export function PlaylistSection() {
  const {
    playlists,
    playlistsLoading,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    playPlaylist,
  } = useMusicContext()
  const user = useAuthStore((s) => s.user)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [creating, setCreating] = useState(false)

  const [detailPlaylist, setDetailPlaylist] =
    useState<MusicPlaylistMeta | null>(null)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createPlaylist(newName.trim(), newDesc.trim() || null)
      setCreateOpen(false)
      setNewName("")
      setNewDesc("")
    } finally {
      setCreating(false)
    }
  }

  if (playlistsLoading) return null

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[10px] tracking-[0.2em] text-muted-foreground/50">
          PLAYLISTS
        </p>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          New playlist
        </button>
      </div>

      {playlists.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-foreground/10 py-8">
          <p className="text-sm text-muted-foreground/60">No playlists yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {playlists.map((pl) => {
            const canManage =
              user?.permissions === "*" || pl.createdBy === user?.id
            return (
              <PlaylistCard
                key={pl.id}
                playlist={pl}
                canManage={canManage}
                onOpen={() => setDetailPlaylist(pl)}
                onDelete={deletePlaylist}
                onRename={renamePlaylist}
                onPlay={async (shuffle) => {
                  const { playlist } = await fetchMusicPlaylist(pl.id)
                  playPlaylist(playlist.tracks, undefined, shuffle)
                }}
              />
            )
          })}
        </div>
      )}

      {/* Create playlist dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          if (!o) setCreateOpen(false)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>New playlist</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={200}
                className="input-glass w-full"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Description
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                maxLength={500}
                className="input-glass w-full"
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Playlist detail modal */}
      {detailPlaylist && (
        <PlaylistDetailModal
          playlist={detailPlaylist}
          canManage={
            user?.permissions === "*" || detailPlaylist.createdBy === user?.id
          }
          onClose={() => setDetailPlaylist(null)}
        />
      )}
    </section>
  )
}

// ── Playlist cover art ────────────────────────────────────────────────────────

function PlaylistCoverArt({
  coverUrls,
  trackCount,
}: {
  coverUrls?: string[]
  trackCount: number
}) {
  const covers = (coverUrls ?? []).slice(0, 4)
  if (trackCount === 0) {
    return <Music2 className="h-12 w-12 text-muted-foreground/20" />
  }
  const cells = Array.from({ length: 4 }, (_, index) => covers[index] ?? null)
  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2">
      {cells.map((url, i) =>
        url ? (
          <img
            key={i}
            src={url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            key={i}
            className="flex h-full w-full items-center justify-center bg-foreground/8 text-muted-foreground/30"
            aria-hidden
          >
            <Music2 className="h-4 w-4" />
          </div>
        )
      )}
    </div>
  )
}

// ── Playlist card ─────────────────────────────────────────────────────────────

interface PlaylistCardProps {
  playlist: MusicPlaylistMeta
  canManage: boolean
  onOpen: () => void
  onDelete: (id: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onPlay: (shuffle: boolean) => Promise<void>
}

function PlaylistCard({
  playlist,
  canManage,
  onOpen,
  onDelete,
  onRename,
  onPlay,
}: PlaylistCardProps) {
  const [playing, setPlaying] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(playlist.name)

  const handlePlay = async (e: React.MouseEvent, shuffle: boolean) => {
    e.stopPropagation()
    if (playlist.trackCount === 0) return
    setPlaying(true)
    try {
      await onPlay(shuffle)
    } finally {
      setPlaying(false)
    }
  }

  const handleRename = async () => {
    if (!nameInput.trim() || nameInput.trim() === playlist.name) {
      setRenameOpen(false)
      return
    }
    setRenaming(true)
    try {
      await onRename(playlist.id, nameInput.trim())
      setRenameOpen(false)
    } finally {
      setRenaming(false)
    }
  }

  return (
    <>
      <div
        className="glass-card group relative flex cursor-pointer flex-col overflow-hidden rounded-xl transition-all select-none hover:ring-1 hover:ring-foreground/20"
        onClick={onOpen}
      >
        {/* Cover art */}
        <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-foreground/5">
          <PlaylistCoverArt
            coverUrls={playlist.coverUrls}
            trackCount={playlist.trackCount}
          />

          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => handlePlay(e, false)}
              disabled={playing || playlist.trackCount === 0}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/18 shadow-[0_14px_30px_rgba(0,0,0,0.35)] ring-1 ring-white/30 backdrop-blur-xl hover:bg-white/24 disabled:opacity-40"
              aria-label="Play playlist"
            >
              {playing ? (
                <Spinner size="sm" className="text-white" />
              ) : (
                <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
              )}
            </button>
            <button
              onClick={(e) => handlePlay(e, true)}
              disabled={playing || playlist.trackCount === 0}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/18 shadow-[0_14px_30px_rgba(0,0,0,0.35)] ring-1 ring-white/30 backdrop-blur-xl hover:bg-white/24 disabled:opacity-40"
              aria-label="Shuffle playlist"
            >
              <Shuffle className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div className="flex flex-col gap-0.5 px-3 py-2.5">
          <p className="truncate text-sm font-medium text-foreground">
            {playlist.name}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {playlist.trackCount}{" "}
            {playlist.trackCount === 1 ? "track" : "tracks"}
          </p>
        </div>

        {/* Management buttons (creator / superuser) */}
        {canManage && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setNameInput(playlist.name)
                setRenameOpen(true)
              }}
              className={SMALL_TILE_BUTTON_CLASS}
              aria-label="Rename playlist"
              title="Rename"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setConfirmDelete(true)
              }}
              className={SMALL_TILE_BUTTON_CLASS}
              aria-label="Delete playlist"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Rename dialog */}
      <Dialog
        open={renameOpen}
        onOpenChange={(o) => {
          if (!o) setRenameOpen(false)
        }}
      >
        <DialogContent
          showCloseButton={false}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Rename playlist</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            maxLength={200}
            className="input-glass w-full"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename()
            }}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRenameOpen(false)}
              disabled={renaming}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRename}
              disabled={!nameInput.trim() || renaming}
            >
              {renaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              "{playlist.name}" will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(playlist.id)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ── Playlist detail modal ──────────────────────────────────────────────────────

interface PlaylistDetailModalProps {
  playlist: MusicPlaylistMeta
  canManage: boolean
  onClose: () => void
}

function PlaylistDetailModal({
  playlist,
  canManage,
  onClose,
}: PlaylistDetailModalProps) {
  const {
    playPlaylist,
    removeTrackFromPlaylist,
    addTracksToQueue,
    addTracksAsPlayNext,
  } = useMusicContext()
  const [tracks, setTracks] = useState<
    Awaited<ReturnType<typeof fetchMusicPlaylist>>["playlist"]["tracks"] | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [updatingCover, setUpdatingCover] = useState(false)
  const dragIndexRef = useRef<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)
  const handleReorder = useCallback(
    async (from: number, to: number) => {
      if (!tracks) return
      const ordered = moveItem(tracks, from, to)
      setTracks(ordered)
      try {
        await reorderPlaylistTracks(
          playlist.id,
          ordered.map((t) => t.id)
        )
      } catch (err) {
        console.error("[PlaylistSection] reorder error", err)
        setTracks(tracks)
      }
    },
    [playlist.id, tracks]
  )
  const handleDragStart = useCallback(
    (index: number, event: DragEvent<HTMLDivElement>) => {
      dragIndexRef.current = index
      setDropIndex(index)
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer?.setData("text/plain", String(index))
      const preview = event.currentTarget.cloneNode(true) as HTMLDivElement
      preview.style.position = "fixed"
      preview.style.top = "-9999px"
      preview.style.left = "-9999px"
      preview.style.width = `${event.currentTarget.getBoundingClientRect().width}px`
      preview.style.pointerEvents = "none"
      preview.style.opacity = "0.95"
      preview.style.transform = "scale(0.98)"
      preview.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)"
      preview.style.borderRadius = "12px"
      preview.style.background = "var(--glass-bg-overlay)"
      preview.style.backdropFilter = "var(--glass-blur-panel)"
      document.body.append(preview)
      event.dataTransfer.setDragImage(preview, 24, 24)
      requestAnimationFrame(() => preview.remove())
    },
    []
  )
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }, [])
  const handleDrop = useCallback(
    (index: number, event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const from = dragIndexRef.current
      if (from === null) return
      dragIndexRef.current = null
      setDropIndex(null)
      void handleReorder(from, index)
    },
    [handleReorder]
  )
  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null
    setDropIndex(null)
  }, [])

  useEffect(() => {
    fetchMusicPlaylist(playlist.id)
      .then(({ playlist: p }) => setTracks(p.tracks))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.id])

  const handlePlay = (startId?: string, shuffle = false) => {
    if (!tracks || tracks.length === 0) return
    playPlaylist(tracks, startId, shuffle)
    onClose()
  }

  const handleRemoveTrack = async (trackId: string) => {
    await removeTrackFromPlaylist(playlist.id, trackId)
    setTracks((prev) => prev?.filter((t) => t.id !== trackId) ?? null)
  }

  const handlePlaylistCoverUpdate = async (file: File) => {
    if (!tracks || tracks.length === 0) return
    setUpdatingCover(true)
    try {
      const upload = await uploadMusicTrackAsset("covers", file)
      const updated = await Promise.all(
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
      setTracks((prev) => {
        if (!prev) return prev
        const updates = new Map(updated.map(({ track }) => [track.id, track]))
        return prev.map((track) => updates.get(track.id) ?? track)
      })
    } catch (err) {
      console.error("[PlaylistSection] cover update error", err)
    } finally {
      setUpdatingCover(false)
    }
  }

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
              <DialogTitle className="truncate">{playlist.name}</DialogTitle>
              {playlist.description && (
                <p className="mt-1 text-sm text-muted-foreground/80">
                  {playlist.description}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManage && (
                <button
                  onClick={() => coverInputRef.current?.click()}
                  disabled={!tracks || tracks.length === 0 || updatingCover}
                  className={DETAIL_ACTION_BUTTON_CLASS}
                  aria-label="Add cover art"
                  title="Add cover art"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => handlePlay(undefined, false)}
                disabled={!tracks || tracks.length === 0}
                className={DETAIL_ACTION_PRIMARY_BUTTON_CLASS}
                aria-label="Play playlist"
                title="Play playlist"
              >
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              </button>
              <button
                onClick={() => handlePlay(undefined, true)}
                disabled={!tracks || tracks.length === 0}
                className={DETAIL_ACTION_BUTTON_CLASS}
                aria-label="Shuffle playlist"
                title="Shuffle playlist"
              >
                <Shuffle className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  if (tracks) {
                    addTracksAsPlayNext(tracks.map((t) => t.id))
                    onClose()
                  }
                }}
                disabled={!tracks || tracks.length === 0}
                className={DETAIL_ACTION_BUTTON_CLASS}
                aria-label="Play playlist next"
                title="Play playlist next"
              >
                <ListStart className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  if (tracks) {
                    addTracksToQueue(tracks.map((t) => t.id))
                    onClose()
                  }
                }}
                disabled={!tracks || tracks.length === 0}
                className={DETAIL_ACTION_BUTTON_CLASS}
                aria-label="Add playlist to queue"
                title="Add playlist to queue"
              >
                <ListEnd className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </DialogHeader>
        {canManage && (
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handlePlaylistCoverUpdate(file)
              event.target.value = ""
            }}
          />
        )}

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="md" clockwise className="text-muted-foreground" />
            </div>
          ) : !tracks || tracks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground/60">
              No tracks in this playlist.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 select-none">
              {tracks.map((track, i) => (
                <div
                  key={track.id}
                  draggable
                  onDragStart={(event) => handleDragStart(i, event)}
                  onDragOver={(event) => {
                    handleDragOver(event)
                    setDropIndex(i)
                  }}
                  onDrop={(event) => handleDrop(i, event)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "group/ti flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-foreground/5",
                    dropIndex === i && dragIndexRef.current !== i
                      ? "border-t-2 border-cyan-300/70"
                      : ""
                  )}
                  onClick={() => handlePlay(track.id, false)}
                >
                  <span className="flex h-5 w-5 items-center justify-center text-muted-foreground/40">
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  <span className="w-5 shrink-0 text-center text-xs text-muted-foreground/40 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-foreground/5">
                    {track.coverUrl ? (
                      <img
                        src={track.coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Music2 className="h-3.5 w-3.5 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {track.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {track.artist}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveTrack(track.id)
                      }}
                      className="shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover/ti:opacity-100 hover:text-destructive"
                      aria-label="Remove from playlist"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
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
