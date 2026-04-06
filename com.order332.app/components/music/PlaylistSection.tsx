"use client"

import { type DragEvent, useCallback, useEffect, useRef, useState } from "react"
import {
  ChevronRight,
  GripVertical,
  Loader2,
  Music2,
  Play,
  Plus,
  Shuffle,
  Trash2,
} from "lucide-react"
import { fetchMusicPlaylist, type MusicPlaylistMeta } from "@/lib/music-api"
import { useMusicContext } from "./MusicContext"
import { useAuthStore } from "@/lib/auth-store"
import { moveItem } from "@/lib/music-queue"
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
  const covers = coverUrls ?? []
  const visible = Math.min(trackCount, 4)
  if (visible === 0) {
    return <Music2 className="h-12 w-12 text-muted-foreground/20" />
  }
  const cells = Array.from({ length: 4 }, (_, index) => {
    if (index >= visible) return null
    return covers[index] ?? null
  })
  return (
    <div className="grid h-full w-full grid-cols-2">
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
            className="flex h-full w-full items-center justify-center rounded-md bg-foreground/8 text-muted-foreground/30"
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
        className="glass-card group relative flex cursor-pointer flex-col overflow-hidden rounded-xl transition-all hover:ring-1 hover:ring-foreground/20"
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
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-md hover:bg-white/20 disabled:opacity-40"
              aria-label="Play playlist"
            >
              {playing ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
              )}
            </button>
            <button
              onClick={(e) => handlePlay(e, true)}
              disabled={playing || playlist.trackCount === 0}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-md hover:bg-white/20 disabled:opacity-40"
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
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-foreground/80"
              aria-label="Rename playlist"
              title="Rename"
            >
              <ChevronRight className="h-3 w-3 rotate-[-90deg]" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setConfirmDelete(true)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive/80"
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
  const { playPlaylist, removeTrackFromPlaylist } = useMusicContext()
  const [tracks, setTracks] = useState<
    Awaited<ReturnType<typeof fetchMusicPlaylist>>["playlist"]["tracks"] | null
  >(null)
  const [loading, setLoading] = useState(true)
  const dragIndexRef = useRef<number | null>(null)
  const moveTrack = useCallback((from: number, to: number) => {
    setTracks((prev) => (prev ? moveItem(prev, from, to) : prev))
  }, [])
  const handleDragStart = useCallback(
    (index: number, event: DragEvent<HTMLDivElement>) => {
      dragIndexRef.current = index
      event.dataTransfer?.setData("text/plain", String(index))
    },
    []
  )
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }, [])
  const handleDrop = useCallback(
    (index: number, event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      if (dragIndexRef.current === null) return
      moveTrack(dragIndexRef.current, index)
      dragIndexRef.current = null
    },
    [moveTrack]
  )
  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null
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

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[80vh] flex-col"
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{playlist.name}</DialogTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePlay(undefined, false)}
                disabled={!tracks || tracks.length === 0}
                className="glass-button glass-button-ghost flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
              >
                <Play className="h-3 w-3 fill-current" /> Play
              </button>
              <button
                onClick={() => handlePlay(undefined, true)}
                disabled={!tracks || tracks.length === 0}
                className="glass-button glass-button-ghost flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
              >
                <Shuffle className="h-3 w-3" /> Shuffle
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !tracks || tracks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground/60">
              No tracks in this playlist.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {tracks.map((track, i) => (
                <div
                  key={track.id}
                  draggable
                  onDragStart={(event) => handleDragStart(i, event)}
                  onDragOver={handleDragOver}
                  onDrop={(event) => handleDrop(i, event)}
                  onDragEnd={handleDragEnd}
                  className="group/ti flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-foreground/5"
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
