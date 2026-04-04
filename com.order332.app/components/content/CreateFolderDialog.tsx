"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface CreateFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => Promise<void>
}

export function CreateFolderDialog({ open, onOpenChange, onCreate }: CreateFolderDialogProps) {
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      await onCreate(trimmed)
      setName("")
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!loading) {
          onOpenChange(o)
          if (!o) { setName(""); setError(null) }
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogTitle>New Folder</DialogTitle>
        <div className="mt-2 flex flex-col gap-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreate() }}
            maxLength={200}
            placeholder="Folder name"
            autoFocus
            className="w-full rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/20 focus:outline-none"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleCreate()} disabled={!name.trim() || loading}>
              {loading ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
