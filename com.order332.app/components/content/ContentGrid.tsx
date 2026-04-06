"use client"

import { useState } from "react"
import { FolderOpen, FolderPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { AudioPlayerProvider } from "@/components/ui/audio-player"
import { ContentItemCard } from "./ContentItemCard"
import { FolderCard } from "./FolderCard"
import { CreateFolderDialog } from "./CreateFolderDialog"
import {
  createContentFolder,
  renameContentFolder,
  deleteContentFolder,
  type ContentItemMeta,
  type ContentFolder,
} from "@/lib/content-api"

interface ContentGridProps {
  items: ContentItemMeta[]
  folders: ContentFolder[]
  currentFolderId: string | null
  isCreator: boolean
  onDelete: (id: string) => void
  onUpdate: (item: ContentItemMeta) => void
  onMove: (itemId: string, folderId: string | null) => void
  onNavigateFolder: (id: string | null) => void
  onFoldersChange: (folders: ContentFolder[]) => void
}

export function ContentGrid({
  items,
  folders,
  currentFolderId,
  isCreator,
  onDelete,
  onUpdate,
  onMove,
  onNavigateFolder,
  onFoldersChange,
}: ContentGridProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [renamingFolder, setRenamingFolder] = useState<ContentFolder | null>(
    null
  )
  const [renameValue, setRenameValue] = useState("")
  const [renameLoading, setRenameLoading] = useState(false)

  // Only show folders that belong to the current level
  const currentFolders = folders.filter((f) => f.parentId === currentFolderId)

  const handleCreateFolder = async (name: string) => {
    const { folder } = await createContentFolder(name, currentFolderId)
    onFoldersChange([...folders, folder])
  }

  const handleRenameConfirm = async () => {
    if (!renamingFolder || !renameValue.trim()) return
    setRenameLoading(true)
    try {
      const { folder: updated } = await renameContentFolder(
        renamingFolder.id,
        renameValue.trim()
      )
      onFoldersChange(folders.map((f) => (f.id === updated.id ? updated : f)))
      setRenamingFolder(null)
    } catch (err) {
      console.error("[ContentGrid] rename error:", err)
    } finally {
      setRenameLoading(false)
    }
  }

  const handleDeleteFolder = async (folder: ContentFolder) => {
    try {
      await deleteContentFolder(folder.id)
      // Remove the deleted folder and all its descendants
      const toRemove = collectDescendants(folders, folder.id)
      toRemove.add(folder.id)
      onFoldersChange(folders.filter((f) => !toRemove.has(f.id)))
    } catch (err) {
      console.error("[ContentGrid] delete folder error:", err)
    }
  }

  const parentFolderId = currentFolderId
    ? (folders.find((f) => f.id === currentFolderId)?.parentId ?? null)
    : null
  const isEmpty =
    currentFolders.length === 0 && items.length === 0 && !currentFolderId

  return (
    <>
      <div className="space-y-6">
        {/* Folders section */}
        {(currentFolders.length > 0 || isCreator || currentFolderId) && (
          <div>
            <p className="card-label mb-3">Folders</p>
            <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {/* Virtual ".." card — drop target to move items to parent; also navigates up */}
              {currentFolderId && (
                <ParentFolderCard
                  onNavigate={() => onNavigateFolder(parentFolderId)}
                  onDrop={(itemId) => onMove(itemId, parentFolderId)}
                />
              )}
              {isCreator && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="glass-card flex flex-col items-start gap-3 rounded-xl border-2 border-dashed border-foreground/10 p-4 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5">
                    <FolderPlus className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">New folder</p>
                </button>
              )}
              {currentFolders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  isCreatorMode={isCreator}
                  onOpen={() => onNavigateFolder(folder.id)}
                  onRename={() => {
                    setRenamingFolder(folder)
                    setRenameValue(folder.name)
                  }}
                  onDelete={() => void handleDeleteFolder(folder)}
                  onDrop={(itemId) => onMove(itemId, folder.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Items section */}
        {items.length > 0 && (
          <div>
            {(currentFolders.length > 0 || currentFolderId) && (
              <p className="card-label mb-3">Files</p>
            )}
            <AudioPlayerProvider>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((item) => (
                  <div key={item.id}>
                    <ContentItemCard
                      item={item}
                      isCreator={isCreator}
                      onDelete={onDelete}
                      onUpdate={onUpdate}
                    />
                  </div>
                ))}
              </div>
            </AudioPlayerProvider>
          </div>
        )}

        {isEmpty && (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-foreground/10">
            <p className="text-sm tracking-wider text-muted-foreground">
              No content yet.
            </p>
          </div>
        )}
      </div>

      <CreateFolderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreateFolder}
      />

      {/* Inline rename dialog */}
      {renamingFolder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setRenamingFolder(null)}
        >
          <div
            className="glass-card w-full max-w-sm rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-4 text-sm font-semibold text-foreground">
              Rename Folder
            </p>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRenameConfirm()
              }}
              maxLength={200}
              autoFocus
              className="w-full rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/20 focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRenamingFolder(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRenameConfirm()}
                disabled={!renameValue.trim() || renameLoading}
                className="rounded-lg bg-foreground px-3 py-1.5 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                {renameLoading ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ParentFolderCard({
  onNavigate,
  onDrop,
}: {
  onNavigate: () => void
  onDrop: (itemId: string) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/x-content-item-id")) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const itemId = e.dataTransfer.getData("application/x-content-item-id")
    if (itemId) onDrop(itemId)
  }

  return (
    <div
      className={cn(
        "glass-card group relative flex cursor-pointer flex-col overflow-hidden rounded-xl transition-shadow",
        isDragOver && "bg-foreground/5 ring-2 ring-foreground/40"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        onClick={onNavigate}
        className="flex w-full flex-col items-start gap-3 p-4 text-left"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/5">
          <FolderOpen className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">..</p>
      </button>
    </div>
  )
}

function collectDescendants(
  folders: ContentFolder[],
  rootId: string
): Set<string> {
  const result = new Set<string>()
  const queue = [rootId]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const f of folders) {
      if (f.parentId === id) {
        result.add(f.id)
        queue.push(f.id)
      }
    }
  }
  return result
}
