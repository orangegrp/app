"use client"

import { useState } from "react"
import { Music2, Pause, Pencil, Play, Share2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration, type MusicTrackMeta } from "@/lib/music-api"
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

const GENRES = ["Pop", "Rock", "Hip-Hop", "Electronic", "Jazz", "Classical", "R&B", "Country", "Folk", "Ambient", "Metal", "Punk", "Indie", "Soul", "Reggae"]

interface MusicTrackCardProps {
  track: MusicTrackMeta
  isActive: boolean
  isPlaying: boolean
  onPlay: () => void
  isCreator: boolean
  onDelete: (id: string) => void
  onEdit: (id: string, meta: { title: string; artist: string; genre?: string }) => Promise<void>
}

export function MusicTrackCard({
  track,
  isActive,
  isPlaying,
  onPlay,
  isCreator,
  onDelete,
  onEdit,
}: MusicTrackCardProps) {
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [editArtist, setEditArtist] = useState("")
  const [editGenre, setEditGenre] = useState("")
  const showingPlay = isActive && isPlaying

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditTitle(track.title)
    setEditArtist(track.artist)
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
        genre: editGenre.trim() || undefined,
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

      {/* Action buttons — share visible to all, edit/delete only for creators */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); setShareOpen(true) }}
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
              onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
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
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditOpen(false) }}>
        <DialogContent showCloseButton={false} onClick={(e) => e.stopPropagation()}>
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
                {GENRES.map((g) => <option key={g} value={g} />)}
              </datalist>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!editTitle.trim() || !editArtist.trim() || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete track?</AlertDialogTitle>
            <AlertDialogDescription>
              "{track.title}" will be permanently deleted and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => { e.stopPropagation(); handleDeleteConfirm() }}
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
