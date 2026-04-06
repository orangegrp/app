"use client"

import { useCallback, useState } from "react"
import {
  ListEnd,
  ListStart,
  MoreHorizontal,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Share2,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  formatDuration,
  type MusicTrackMeta,
  type MusicPlaylistMeta,
} from "@/lib/music-api"
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ShareTrackDialog } from "@/components/music/ShareTrackDialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useLongPress } from "@/hooks/use-long-press"

const GENRES = [
  "Pop",
  "Rock",
  "Hip-Hop",
  "Electronic",
  "Jazz",
  "Classical",
  "R&B",
  "Country",
  "Folk",
  "Ambient",
  "Metal",
  "Punk",
  "Indie",
  "Soul",
  "Reggae",
]

interface MusicTrackCardProps {
  track: MusicTrackMeta
  isActive: boolean
  isPlaying: boolean
  onPlay: () => void
  isCreator: boolean
  onDelete: (id: string) => void
  onEdit: (
    id: string,
    meta: {
      title: string
      artist: string
      album?: string | null
      genre?: string | null
    }
  ) => Promise<void>
  onAddToQueue?: (id: string) => void
  onPlayNext?: (id: string) => void
  playlists?: MusicPlaylistMeta[]
  onAddToPlaylist?: (playlistId: string, trackId: string) => Promise<void>
}

export function MusicTrackCard({
  track,
  isActive,
  isPlaying,
  onPlay,
  isCreator,
  onDelete,
  onEdit,
  onAddToQueue,
  onPlayNext,
  playlists,
  onAddToPlaylist,
}: MusicTrackCardProps) {
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const longPressHandlers = useLongPress(() => setMenuOpen(true))
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const handleMenuAction = useCallback((action?: () => void) => {
    action?.()
    setMenuOpen(false)
  }, [])
  const [editTitle, setEditTitle] = useState("")
  const [editArtist, setEditArtist] = useState("")
  const [editAlbum, setEditAlbum] = useState("")
  const [editGenre, setEditGenre] = useState("")
  const showingPlay = isActive && isPlaying

  const openEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setEditTitle(track.title)
    setEditArtist(track.artist)
    setEditAlbum(track.album ?? "")
    setEditGenre(track.genre ?? "")
    setEditOpen(true)
  }

  const handleSave = async () => {
    if (!editTitle.trim() || !editArtist.trim()) return
    setSaving(true)
    try {
      await onEdit(track.id, {
        title: editTitle.trim(),
        artist: editArtist.trim(),
        album: editAlbum.trim() || null,
        genre: editGenre.trim() || null,
      })
      setEditOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = () => {
    setDeleting(true)
    setConfirmOpen(false)
    onDelete(track.id)
  }

  return (
    <div
      className={cn(
        "glass-card group relative flex flex-col overflow-hidden rounded-xl transition-all",
        isActive && "ring-1 ring-foreground/30"
      )}
    >
      {/* Cover art */}
      <div
        className="relative aspect-square overflow-hidden bg-foreground/5"
        {...longPressHandlers}
      >
        {track.coverUrl ? (
          <img
            src={track.coverUrl}
            alt={`${track.title} cover`}
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

        <div className="pointer-events-none absolute inset-0">
          <div className="flex h-full flex-col justify-between p-3">
            <div className="flex justify-end gap-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShareOpen(true)
                }}
                type="button"
                className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                aria-label="Share track"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <ContextMenuTrigger>
                  <button
                    type="button"
                    className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    aria-label="Show actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onSelect={() => handleMenuAction(() => onPlay())}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {showingPlay ? "Pause" : "Play"}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() =>
                      handleMenuAction(() => onPlayNext?.(track.id))
                    }
                  >
                    <ListStart className="h-3.5 w-3.5" />
                    Play next
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() =>
                      handleMenuAction(() => onAddToQueue?.(track.id))
                    }
                  >
                    <ListEnd className="h-3.5 w-3.5" />
                    Add to queue
                  </ContextMenuItem>
                  {playlists && onAddToPlaylist && (
                    <ContextMenuItem
                      onSelect={() =>
                        handleMenuAction(() => setPlaylistOpen(true))
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add to playlist
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem
                    onSelect={() => handleMenuAction(() => setShareOpen(true))}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </ContextMenuItem>
                  {isCreator && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onSelect={() => handleMenuAction(() => openEdit())}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit track
                      </ContextMenuItem>
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() =>
                          handleMenuAction(() => setConfirmOpen(true))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete track
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            </div>
            <div className="flex flex-1 items-center justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onPlay()
                }}
                type="button"
                className={cn(
                  "pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/60 shadow-lg transition",
                  showingPlay ? "bg-foreground" : "bg-white/10"
                )}
                aria-label={showingPlay ? "Pause track" : "Play track"}
              >
                {showingPlay ? (
                  <Pause className="h-6 w-6 fill-white text-white" />
                ) : (
                  <Play className="ml-0.5 h-6 w-6 fill-white text-white" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Active waveform indicator */}
        {isActive && (
          <div className="absolute bottom-2 left-2">
            <div className="flex h-4 items-end gap-0.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1 rounded-full bg-white",
                    isPlaying && "animate-bounce"
                  )}
                  style={{
                    height: `${Math.random() * 50 + 50}%`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: "0.6s",
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="truncate text-sm font-medium text-foreground">
          {track.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
        {track.album && (
          <p className="truncate text-xs text-muted-foreground/60 italic">
            {track.album}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          {track.genre && (
            <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-xs text-muted-foreground">
              {track.genre}
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground/60 tabular-nums">
            {formatDuration(track.durationSec)}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onPlayNext && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPlayNext(track.id)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-foreground/80"
            aria-label="Play next"
            title="Play next"
          >
            <ListStart className="h-3 w-3" />
          </button>
        )}
        {onAddToQueue && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddToQueue(track.id)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-foreground/80"
            aria-label="Add to queue"
            title="Add to queue"
          >
            <ListEnd className="h-3 w-3" />
          </button>
        )}
        {playlists && onAddToPlaylist && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setPlaylistOpen(true)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-foreground/80"
            aria-label="Add to playlist"
            title="Add to playlist"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShareOpen(true)
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-foreground/80"
          aria-label="Share track"
        >
          <Share2 className="h-3 w-3" />
        </button>
        {isCreator && (
          <>
            <button
              onClick={openEdit}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-foreground/80"
              aria-label="Edit track"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setConfirmOpen(true)
              }}
              disabled={deleting}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive/80"
              aria-label="Delete track"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          if (!o) setEditOpen(false)
        }}
      >
        <DialogContent
          showCloseButton={false}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Edit track</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
                className="input-glass w-full"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Artist <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={editArtist}
                onChange={(e) => setEditArtist(e.target.value)}
                maxLength={200}
                className="input-glass w-full"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Album
              </label>
              <input
                type="text"
                value={editAlbum}
                onChange={(e) => setEditAlbum(e.target.value)}
                maxLength={200}
                placeholder="e.g. Midnight Rain"
                className="input-glass w-full"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Genre
              </label>
              <input
                type="text"
                list="edit-genre-list"
                value={editGenre}
                onChange={(e) => setEditGenre(e.target.value)}
                maxLength={100}
                placeholder="e.g. Electronic"
                className="input-glass w-full"
              />
              <datalist id="edit-genre-list">
                {GENRES.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!editTitle.trim() || !editArtist.trim() || saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to playlist dialog */}
      {playlists && onAddToPlaylist && (
        <Dialog
          open={playlistOpen}
          onOpenChange={(o) => {
            if (!o) setPlaylistOpen(false)
          }}
        >
          <DialogContent
            showCloseButton={false}
            onClick={(e) => e.stopPropagation()}
          >
            <DialogHeader>
              <DialogTitle>Add to playlist</DialogTitle>
            </DialogHeader>
            <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {playlists.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No playlists yet.
                </p>
              ) : (
                playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={async (e) => {
                      e.stopPropagation()
                      await onAddToPlaylist(pl.id, track.id)
                      setPlaylistOpen(false)
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-foreground/8"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground/8">
                      <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {pl.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pl.trackCount} tracks
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPlaylistOpen(false)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete track?</AlertDialogTitle>
            <AlertDialogDescription>
              "{track.title}" will be permanently deleted and cannot be
              recovered.
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
                handleDeleteConfirm()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareTrackDialog
        trackId={track.id}
        trackTitle={track.title}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </div>
  )
}
