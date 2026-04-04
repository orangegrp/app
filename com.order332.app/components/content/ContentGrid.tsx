"use client"

import { useState } from "react"
import { FolderPlus } from "lucide-react"
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
  onNavigateFolder: (id: string) => void
  onFoldersChange: (folders: ContentFolder[]) => void
}

export function ContentGrid({
  items,
  folders,
  currentFolderId,
  isCreator,
  onDelete,
  onUpdate,
  onNavigateFolder,
  onFoldersChange,
}: ContentGridProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [renamingFolder, setRenamingFolder] = useState<ContentFolder | null>(null)
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
      const { folder: updated } = await renameContentFolder(renamingFolder.id, renameValue.trim())
      onFoldersChange(folders.map((f) => (f.id === updated.id ? updated : f)))
      setRenamingFolder(null)
    } catch (err) {
      console.error('[ContentGrid] rename error:', err)
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
      console.error('[ContentGrid] delete folder error:', err)
    }
  }

  const isEmpty = currentFolders.length === 0 && items.length === 0

  return (
    <>
      <div className="space-y-6">
        {/* Folders section */}
        {(currentFolders.length > 0 || isCreator) && (
          <div>
            <p className="card-label mb-3">Folders</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 items-start">
              {isCreator && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="glass-card flex flex-col items-start gap-3 rounded-xl p-4 text-left transition-colors hover:bg-foreground/5 border-2 border-dashed border-foreground/10 hover:border-foreground/20"
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
                  onRename={() => { setRenamingFolder(folder); setRenameValue(folder.name) }}
                  onDelete={() => void handleDeleteFolder(folder)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Items section — CSS columns for natural card heights (masonry feel) */}
        {items.length > 0 && (
          <div>
            {currentFolders.length > 0 && <p className="card-label mb-3">Files</p>}
            <AudioPlayerProvider>
              <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
                {items.map((item) => (
                  <div key={item.id} className="mb-4 break-inside-avoid">
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
            <p className="text-sm text-muted-foreground tracking-wider">No content yet.</p>
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
            <p className="mb-4 text-sm font-semibold text-foreground">Rename Folder</p>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleRenameConfirm() }}
              maxLength={200}
              autoFocus
              className="w-full rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/20 focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRenamingFolder(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRenameConfirm()}
                disabled={!renameValue.trim() || renameLoading}
                className="rounded-lg bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-80 transition-opacity disabled:opacity-40"
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

function collectDescendants(folders: ContentFolder[], rootId: string): Set<string> {
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
