"use client"

import { ChevronRight } from "lucide-react"
import type { ContentFolder } from "@/lib/content-api"

interface FolderBreadcrumbProps {
  folders: ContentFolder[]
  currentFolderId: string | null
  onNavigate: (id: string | null) => void
}

/** Builds the ancestor chain from a flat folder list by walking parentId links. */
function buildAncestors(folders: ContentFolder[], currentId: string | null): ContentFolder[] {
  if (!currentId) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const chain: ContentFolder[] = []
  let node = byId.get(currentId)
  while (node) {
    chain.unshift(node)
    node = node.parentId ? byId.get(node.parentId) : undefined
  }
  return chain
}

export function FolderBreadcrumb({ folders, currentFolderId, onNavigate }: FolderBreadcrumbProps) {
  const ancestors = buildAncestors(folders, currentFolderId)

  return (
    <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
      <button
        onClick={() => onNavigate(null)}
        className={
          ancestors.length === 0
            ? "font-medium text-foreground"
            : "hover:text-foreground transition-colors"
        }
      >
        Content
      </button>
      {ancestors.map((folder) => (
        <span key={folder.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          <button
            onClick={() => onNavigate(folder.id)}
            className={
              folder.id === currentFolderId
                ? "font-medium text-foreground"
                : "hover:text-foreground transition-colors"
            }
          >
            {folder.name}
          </button>
        </span>
      ))}
    </nav>
  )
}
