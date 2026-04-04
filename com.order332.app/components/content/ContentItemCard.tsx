"use client"

import { useState } from "react"
import { Download, File, FileText, Music, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatFileSize, type ContentItemMeta } from "@/lib/content-api"
import { AudioPlayerButton, AudioPlayerProgress, AudioPlayerTime, AudioPlayerDuration } from "@/components/ui/audio-player"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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

interface ContentItemCardProps {
  item: ContentItemMeta
  isCreator: boolean
  onDelete: (id: string) => void
}

export function ContentItemCard({ item, isCreator, onDelete }: ContentItemCardProps) {
  const [imageExpanded, setImageExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleDeleteConfirm = () => {
    setDeleting(true)
    setConfirmOpen(false)
    onDelete(item.id)
  }

  return (
    <div className="glass-card group relative flex flex-col overflow-hidden rounded-xl">
      {/* Creator delete button */}
      {isCreator && (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
          disabled={deleting}
          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/80"
          aria-label="Delete item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{item.title}" will be permanently deleted and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {item.itemType === "image" && <ImageCard item={item} onExpand={() => setImageExpanded(true)} />}
      {item.itemType === "audio" && <AudioCard item={item} />}
      {item.itemType === "pdf" && <PdfCard item={item} />}
      {item.itemType === "download" && <DownloadCard item={item} />}

      {/* Image expand dialog */}
      {item.itemType === "image" && (
        <Dialog open={imageExpanded} onOpenChange={setImageExpanded}>
          <DialogContent className="max-w-4xl p-2">
            <DialogTitle className="sr-only">{item.title}</DialogTitle>
            <img
              src={item.publicUrl}
              alt={item.title}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function ImageCard({ item, onExpand }: { item: ContentItemMeta; onExpand: () => void }) {
  return (
    <button onClick={onExpand} className="w-full text-left">
      <div className="aspect-square overflow-hidden bg-muted">
        <img
          src={item.publicUrl}
          alt={item.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(item.fileSize)}</p>
      </div>
    </button>
  )
}

function AudioCard({ item }: { item: ContentItemMeta }) {
  const audioItem = { id: item.id, src: item.publicUrl }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5">
        <Music className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(item.fileSize)}</p>
      </div>
      <div className="flex items-center gap-3">
        <AudioPlayerButton
          item={audioItem}
          size="sm"
          variant="ghost"
          className="h-8 w-8 rounded-full p-0"
        />
        <div className="flex-1">
          <AudioPlayerProgress className="w-full" />
        </div>
        <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
          <AudioPlayerTime />
          <span>/</span>
          <AudioPlayerDuration />
        </div>
      </div>
    </div>
  )
}

function PdfCard({ item }: { item: ContentItemMeta }) {
  return (
    <a
      href={item.publicUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-3 p-4 hover:bg-foreground/5 transition-colors"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{formatFileSize(item.fileSize)} · PDF</p>
      </div>
    </a>
  )
}

function DownloadCard({ item }: { item: ContentItemMeta }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5">
        <File className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{formatFileSize(item.fileSize)}</p>
      </div>
      <a
        href={item.publicUrl}
        download={item.title}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </a>
    </div>
  )
}
