"use client"

import { useCallback, useRef, useState } from "react"
import { CloudUpload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  uploadContentItem,
  isVideoMimeType,
  type ContentItemMeta,
} from "@/lib/content-api"
import { Button } from "@/components/ui/button"

const PROXY_UPLOAD_MAX_BYTES = 3 * 1024 * 1024
const SIZE_LIMITS_TEXT = "Maximum upload size: 3 MB"
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "text/plain",
  "text/csv",
].join(",")

interface ContentUploadAreaProps {
  onUploadComplete: (item: ContentItemMeta) => void
  currentFolderId?: string | null
}

export function ContentUploadArea({
  onUploadComplete,
  currentFolderId,
}: ContentUploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    (file: File) => {
      setError(null)
      if (isVideoMimeType(file.type)) {
        setError("Video uploads are not available yet.")
        return
      }
      if (file.size > PROXY_UPLOAD_MAX_BYTES) {
        setError("File exceeds 3 MB limit for proxy uploads.")
        return
      }
      setSelectedFile(file)
      if (!title)
        setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "))
    },
    [title]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile || !title.trim()) return
    setUploading(true)
    setError(null)
    setProgress(0)

    try {
      const { item } = await uploadContentItem(
        selectedFile,
        {
          title: title.trim(),
          description: description.trim() || undefined,
          folderId: currentFolderId,
        },
        setProgress
      )
      onUploadComplete(item)
      setSelectedFile(null)
      setTitle("")
      setDescription("")
      setProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const clearFile = () => {
    setSelectedFile(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="glass-card mb-8 rounded-2xl p-6">
      <p className="card-label mb-4">Upload Content</p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !selectedFile && fileInputRef.current?.click()}
        className={cn(
          "relative flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all",
          dragOver
            ? "border-foreground/40 bg-foreground/5"
            : "border-foreground/10 hover:border-foreground/20 hover:bg-foreground/2",
          selectedFile && "cursor-default"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={onFileChange}
          className="hidden"
        />

        {selectedFile ? (
          <div className="flex w-full items-center justify-between px-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                {selectedFile.type}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                clearFile()
              }}
              className="ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <CloudUpload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag & drop or{" "}
              <span className="text-foreground underline underline-offset-2">
                browse
              </span>
            </p>
            <p className="text-xs text-muted-foreground/60">
              {SIZE_LIMITS_TEXT}
            </p>
          </div>
        )}
      </div>

      {/* Metadata fields */}
      {selectedFile && (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Enter a title"
              className="w-full rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/20 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
              Description{" "}
              <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Optional description"
              className="w-full resize-none rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/20 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Uploading…</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {/* Submit */}
      {selectedFile && (
        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleUpload}
            disabled={!title.trim() || uploading}
            size="sm"
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      )}
    </div>
  )
}
