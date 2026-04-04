"use client"

import { useState } from "react"
import { Folder, Pencil, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
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
import type { ContentFolder } from "@/lib/content-api"

interface FolderCardProps {
  folder: ContentFolder
  isCreatorMode: boolean
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
  onDrop?: (itemId: string) => void
}

export function FolderCard({ folder, isCreatorMode, onOpen, onRename, onDelete, onDrop }: FolderCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-content-item-id')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const itemId = e.dataTransfer.getData('application/x-content-item-id')
    if (itemId) onDrop?.(itemId)
  }

  return (
    <>
      <div
        className={cn("glass-card group relative flex cursor-pointer flex-col overflow-hidden rounded-xl transition-shadow", isDragOver && "ring-2 ring-foreground/40 bg-foreground/5")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Creator actions */}
        {isCreatorMode && (
          <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); onRename() }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-foreground/70"
              aria-label="Rename folder"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive/80"
              aria-label="Delete folder"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <button onClick={onOpen} className="flex flex-col items-start gap-3 p-4 text-left w-full">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5">
            <Folder className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="truncate text-sm font-medium text-foreground w-full">{folder.name}</p>
        </button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              "{folder.name}" will be deleted. Its contents will be moved to root.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => { setConfirmOpen(false); onDelete() }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
