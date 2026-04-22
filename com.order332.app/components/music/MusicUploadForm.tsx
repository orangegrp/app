"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import {
  CheckCircle2,
  CloudUpload,
  FileArchive,
  FileMusic,
  Music2,
  Plus,
  X,
} from "lucide-react"
import {
  addTrackToPlaylist,
  createMusicPlaylist,
  uploadMusicTrack,
  type MusicTrackMeta,
} from "@/lib/music-api"
import { useAuthStore } from "@/lib/auth-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "../ui/spinner"

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
])

const AUDIO_EXTS = new Set([
  ".mp3",
  ".ogg",
  ".wav",
  ".flac",
  ".aac",
  ".m4a",
  ".opus",
])

const LYRICS_EXTS = new Set([".lrc", ".txt"])

const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"].join(",")
const AUDIO_TYPES = [...AUDIO_MIME_TYPES].join(",")

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

type UploadStatus = "ready" | "uploading" | "success" | "error"
type LyricsSearchStatus =
  | "idle"
  | "searching"
  | "found"
  | "not-found"
  | "instrumental"
  | "error"

interface UploadItem {
  id: string
  audioFile: File
  coverFile: File | null
  coverPreview: string | null
  lyricsFile: File | null
  title: string
  artist: string
  album: string
  genre: string
  durationSec: number
  lyricsStatus: LyricsSearchStatus
  fetchedLyrics: string | null
  fetchedLyricsType: "lrc" | "txt"
  progress: number
  status: UploadStatus
  error: string | null
}

interface MusicUploadFormProps {
  onUploadComplete: (tracks: MusicTrackMeta[]) => void
  onCancel: () => void
}

interface ParsedMetadata {
  title: string
  artist: string
  album: string
  genre: string
  durationSec: number
  coverFile: File | null
  coverPreview: string | null
}

interface ZipImportResult {
  ok: boolean
  message: string
  uploadedTracks: MusicTrackMeta[]
  playlistName: string | null
}

function getFileExt(filename: string): string {
  const idx = filename.lastIndexOf(".")
  return idx >= 0 ? filename.slice(idx).toLowerCase() : ""
}

function fileStem(filename: string): string {
  const idx = filename.lastIndexOf(".")
  return idx >= 0 ? filename.slice(0, idx) : filename
}

function normalizeAudioTitle(filename: string): string {
  return fileStem(filename).replace(/[_-]+/g, " ").trim()
}

function isAudioFile(file: File): boolean {
  return (
    AUDIO_MIME_TYPES.has(file.type) || AUDIO_EXTS.has(getFileExt(file.name))
  )
}

function isLyricsFile(file: File): boolean {
  return LYRICS_EXTS.has(getFileExt(file.name))
}

async function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(new Error("Could not read file"))
    reader.readAsDataURL(file)
  })
}

async function pictureToPng(
  picData: Uint8Array,
  picFormat: string
): Promise<{ file: File; preview: string } | null> {
  const blob = new Blob(
    [
      picData.buffer.slice(
        picData.byteOffset,
        picData.byteOffset + picData.byteLength
      ) as ArrayBuffer,
    ],
    { type: picFormat || "image/jpeg" }
  )

  const srcUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("Embedded cover load failed"))
      img.src = srcUrl
    })

    const pngBlob = await new Promise<Blob | null>((resolve) => {
      const canvas = document.createElement("canvas")
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      canvas.getContext("2d")?.drawImage(image, 0, 0)
      canvas.toBlob((b) => resolve(b), "image/png")
    })

    if (!pngBlob) return null
    const pngFile = new File([pngBlob], "cover.png", { type: "image/png" })
    const preview = await toDataUrl(pngFile)
    return { file: pngFile, preview }
  } finally {
    URL.revokeObjectURL(srcUrl)
  }
}

async function parseAudioMetadata(file: File): Promise<ParsedMetadata> {
  const fallbackTitle = normalizeAudioTitle(file.name)

  try {
    const { parseBlob } = await import("music-metadata")
    const meta = await parseBlob(file)
    const { common, format } = meta

    let coverFile: File | null = null
    let coverPreview: string | null = null

    if (common.picture?.[0]) {
      const converted = await pictureToPng(
        common.picture[0].data,
        common.picture[0].format || "image/jpeg"
      )
      if (converted) {
        coverFile = converted.file
        coverPreview = converted.preview
      }
    }

    return {
      title: common.title?.trim() || fallbackTitle,
      artist: common.artist?.trim() || common.albumartist?.trim() || "",
      album: common.album?.trim() || "",
      genre: common.genre?.[0]?.trim() || "",
      durationSec: format.duration ? Math.round(format.duration) : 0,
      coverFile,
      coverPreview,
    }
  } catch {
    return {
      title: fallbackTitle,
      artist: "",
      album: "",
      genre: "",
      durationSec: 0,
      coverFile: null,
      coverPreview: null,
    }
  }
}

function normalizeArchivePath(path: string): string {
  const decoded = path.replace(/^file:\/\//i, "")
  const slashNormalized = decoded.replace(/\\/g, "/")
  const parts = slashNormalized
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)

  const stack: string[] = []
  for (const part of parts) {
    if (part === ".") continue
    if (part === "..") {
      stack.pop()
      continue
    }
    stack.push(part)
  }

  const joined = stack.join("/")
  try {
    return decodeURIComponent(joined).toLowerCase()
  } catch {
    return joined.toLowerCase()
  }
}

function parseM3uTrackPaths(contents: string): string[] {
  const normalized = contents.replace(/^\uFEFF/, "")
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const paths: string[] = []
  for (const line of lines) {
    if (line.startsWith("#")) continue
    const cleaned = line.replace(/^"|"$/g, "")
    paths.push(normalizeArchivePath(cleaned))
  }
  return paths
}

function progressPct(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
}

export function MusicUploadForm({
  onUploadComplete,
  onCancel,
}: MusicUploadFormProps) {
  const audioInputRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)

  const [audioDragging, setAudioDragging] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const [uploadingAll, setUploadingAll] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const [zipImportRunning, setZipImportRunning] = useState(false)
  const [zipProgress, setZipProgress] = useState(0)
  const [zipProgressLabel, setZipProgressLabel] = useState("")
  const [zipResultDialogOpen, setZipResultDialogOpen] = useState(false)
  const [zipResult, setZipResult] = useState<ZipImportResult | null>(null)

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }, [])

  const fetchLyricsForItem = useCallback(
    async (
      itemId: string,
      trackTitle: string,
      trackArtist: string,
      trackDuration: number,
      trackAlbum: string
    ) => {
      if (!trackTitle.trim() || trackDuration === 0) return

      updateItem(itemId, {
        lyricsStatus: "searching",
        fetchedLyrics: null,
      })

      const params = new URLSearchParams({
        track_name: trackTitle.trim(),
        duration: String(trackDuration),
      })
      if (trackArtist.trim()) params.set("artist_name", trackArtist.trim())
      if (trackAlbum.trim()) params.set("album_name", trackAlbum.trim())

      try {
        const accessToken = useAuthStore.getState().accessToken
        const res = await fetch(`/api/music/tracks/lyrics/search?${params}`, {
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        })

        if (!res.ok || !res.body) {
          updateItem(itemId, { lyricsStatus: "error" })
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let eventType = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim()
            } else if (line.startsWith("data: ")) {
              const payload = line.slice(6)
              if (eventType === "not_found") {
                updateItem(itemId, { lyricsStatus: "not-found" })
              } else if (eventType === "error") {
                updateItem(itemId, { lyricsStatus: "error" })
              } else if (eventType === "result") {
                try {
                  const data = JSON.parse(payload) as {
                    syncedLyrics: string | null
                    plainLyrics: string | null
                    instrumental: boolean
                  }
                  if (data.instrumental) {
                    updateItem(itemId, { lyricsStatus: "instrumental" })
                  } else if (data.syncedLyrics) {
                    updateItem(itemId, {
                      lyricsStatus: "found",
                      fetchedLyrics: data.syncedLyrics,
                      fetchedLyricsType: "lrc",
                    })
                  } else if (data.plainLyrics) {
                    updateItem(itemId, {
                      lyricsStatus: "found",
                      fetchedLyrics: data.plainLyrics,
                      fetchedLyricsType: "txt",
                    })
                  } else {
                    updateItem(itemId, { lyricsStatus: "not-found" })
                  }
                } catch {
                  updateItem(itemId, { lyricsStatus: "error" })
                }
              }
              eventType = ""
            }
          }
        }
      } catch {
        updateItem(itemId, { lyricsStatus: "error" })
      }
    },
    [updateItem]
  )

  const applyFetchedLyrics = useCallback(
    (itemId: string) => {
      const item = items.find((it) => it.id === itemId)
      if (!item?.fetchedLyrics) return

      const ext = item.fetchedLyricsType === "lrc" ? ".lrc" : ".txt"
      const blob = new Blob([item.fetchedLyrics], { type: "text/plain" })
      const file = new File([blob], `lyrics${ext}`, { type: "text/plain" })

      updateItem(itemId, {
        lyricsFile: file,
        lyricsStatus: "idle",
        fetchedLyrics: null,
      })
    },
    [items, updateItem]
  )

  const addAudioFiles = useCallback(
    async (filesLike: FileList | File[]) => {
      const files = Array.from(filesLike)
      if (files.length === 0) return

      setGlobalError(null)
      const accepted = files.filter(isAudioFile)
      if (accepted.length === 0) {
        setGlobalError("No valid audio files were selected.")
        return
      }

      const created = await Promise.all(
        accepted.map(async (file) => {
          const parsed = await parseAudioMetadata(file)
          return {
            id: crypto.randomUUID(),
            audioFile: file,
            coverFile: parsed.coverFile,
            coverPreview: parsed.coverPreview,
            lyricsFile: null,
            title: parsed.title,
            artist: parsed.artist,
            album: parsed.album,
            genre: parsed.genre,
            durationSec: parsed.durationSec,
            lyricsStatus: "idle",
            fetchedLyrics: null,
            fetchedLyricsType: "lrc",
            progress: 0,
            status: "ready",
            error: null,
          } satisfies UploadItem
        })
      )

      setItems((prev) => [...prev, ...created])

      for (const item of created) {
        void fetchLyricsForItem(
          item.id,
          item.title,
          item.artist,
          item.durationSec,
          item.album
        )
      }
    },
    [fetchLyricsForItem]
  )

  const setCoverFor = useCallback(
    async (itemId: string, file: File) => {
      const preview = await toDataUrl(file)
      updateItem(itemId, { coverFile: file, coverPreview: preview })
    },
    [updateItem]
  )

  const setLyricsFor = useCallback(
    (itemId: string, file: File) => {
      if (!isLyricsFile(file)) {
        updateItem(itemId, { error: "Lyrics must be a .lrc or .txt file." })
        return
      }
      updateItem(itemId, {
        lyricsFile: file,
        lyricsStatus: "idle",
        fetchedLyrics: null,
        error: null,
      })
    },
    [updateItem]
  )

  const invalidCount = useMemo(
    () => items.filter((it) => !it.title.trim() || !it.artist.trim()).length,
    [items]
  )

  const uploadAll = useCallback(async () => {
    if (items.length === 0 || uploadingAll || zipImportRunning) return

    const hasInvalid = items.some((it) => !it.title.trim() || !it.artist.trim())
    if (hasInvalid) {
      setGlobalError("Each track must include a title and artist.")
      return
    }

    setUploadingAll(true)
    setGlobalError(null)
    const uploadedTracks: MusicTrackMeta[] = []
    let failed = 0

    for (const item of items) {
      updateItem(item.id, { status: "uploading", progress: 0, error: null })
      try {
        const { track } = await uploadMusicTrack(
          item.audioFile,
          item.coverFile,
          item.lyricsFile,
          {
            title: item.title.trim(),
            artist: item.artist.trim(),
            album: item.album.trim() || null,
            genre: item.genre.trim() || null,
            durationSec: item.durationSec,
          },
          (pct) => updateItem(item.id, { progress: pct })
        )
        uploadedTracks.push(track)
        updateItem(item.id, { status: "success", progress: 100 })
      } catch (err) {
        failed += 1
        updateItem(item.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        })
      }
    }

    if (uploadedTracks.length > 0) {
      onUploadComplete(uploadedTracks)
    }

    setUploadingAll(false)

    if (failed === 0) {
      onCancel()
      return
    }

    setGlobalError(
      `${failed} ${failed === 1 ? "track" : "tracks"} failed to upload.`
    )
  }, [
    items,
    onCancel,
    onUploadComplete,
    updateItem,
    uploadingAll,
    zipImportRunning,
  ])

  const handleM3uZipUpload = useCallback(
    async (zipFile: File) => {
      if (zipImportRunning || uploadingAll) return

      setZipImportRunning(true)
      setZipProgress(0)
      setZipProgressLabel("Reading ZIP archive")
      setGlobalError(null)

      try {
        const { default: JSZip } = await import("jszip")
        const zip = await JSZip.loadAsync(zipFile)

        const audioEntries: Array<{ path: string; file: File }> = []
        const lyricsByStem = new Map<string, File[]>()
        let m3uEntry: {
          path: string
          sourceName: string
          text: string
        } | null = null

        const files = Object.values(zip.files).filter((entry) => !entry.dir)

        for (const entry of files) {
          const ext = getFileExt(entry.name)
          const normalizedPath = normalizeArchivePath(entry.name)

          if (ext === ".m3u" || ext === ".m3u8") {
            const text = await entry.async("string")
            m3uEntry = { path: normalizedPath, sourceName: entry.name, text }
            continue
          }

          if (AUDIO_EXTS.has(ext)) {
            const blob = await entry.async("blob")
            const file = new File(
              [blob],
              entry.name.split("/").pop() || entry.name,
              {
                type: blob.type || "audio/mpeg",
              }
            )
            audioEntries.push({ path: normalizedPath, file })
            continue
          }

          if (LYRICS_EXTS.has(ext)) {
            const blob = await entry.async("blob")
            const name = entry.name.split("/").pop() || entry.name
            const lyricFile = new File([blob], name, { type: "text/plain" })
            const stem = fileStem(name).toLowerCase()
            const list = lyricsByStem.get(stem) ?? []
            list.push(lyricFile)
            lyricsByStem.set(stem, list)
          }
        }

        if (!m3uEntry) {
          throw new Error("ZIP must contain an .m3u or .m3u8 playlist file.")
        }
        if (audioEntries.length === 0) {
          throw new Error("ZIP does not contain any supported audio files.")
        }

        setZipProgressLabel("Uploading tracks")

        const uploadedTracks: MusicTrackMeta[] = []
        const trackByPath = new Map<string, MusicTrackMeta>()
        const trackByStem = new Map<string, MusicTrackMeta[]>()
        const totalTracks = audioEntries.length

        for (let i = 0; i < audioEntries.length; i += 1) {
          const entry = audioEntries[i]
          const parsed = await parseAudioMetadata(entry.file)
          const stem = fileStem(entry.file.name).toLowerCase()
          const lyricMatch = (lyricsByStem.get(stem) ?? [])[0] ?? null

          const { track } = await uploadMusicTrack(
            entry.file,
            parsed.coverFile,
            lyricMatch,
            {
              title: parsed.title,
              artist: parsed.artist || "Unknown Artist",
              album: parsed.album || null,
              genre: parsed.genre || null,
              durationSec: parsed.durationSec,
            },
            (pct) => {
              const done = i + pct / 100
              setZipProgress(progressPct(done, totalTracks + 1))
            }
          )

          uploadedTracks.push(track)
          trackByPath.set(entry.path, track)
          const existing = trackByStem.get(stem) ?? []
          existing.push(track)
          trackByStem.set(stem, existing)
        }

        setZipProgressLabel("Creating playlist")
        const orderedPaths = parseM3uTrackPaths(m3uEntry.text)

        const orderedTrackIds: string[] = []
        for (const rawPath of orderedPaths) {
          const byPath = trackByPath.get(rawPath)
          if (byPath) {
            orderedTrackIds.push(byPath.id)
            continue
          }

          const base = rawPath.split("/").pop() || rawPath
          const stem = fileStem(base).toLowerCase()
          const byStem = trackByStem.get(stem)?.[0]
          if (byStem) orderedTrackIds.push(byStem.id)
        }

        const fallbackOrder = uploadedTracks.map((t) => t.id)
        const deduped = Array.from(new Set(orderedTrackIds))
        const finalOrder = deduped.length > 0 ? deduped : fallbackOrder

        const playlistDefaultName =
          normalizeAudioTitle(
            m3uEntry.sourceName.split("/").pop() || "Imported Playlist"
          ) || "Imported Playlist"

        const { playlist } = await createMusicPlaylist(playlistDefaultName)
        for (const trackId of finalOrder) {
          await addTrackToPlaylist(playlist.id, trackId)
        }

        setZipProgress(100)
        onUploadComplete(uploadedTracks)

        setZipResult({
          ok: true,
          message: `Imported ${uploadedTracks.length} tracks and created playlist \"${playlist.name}\".`,
          uploadedTracks,
          playlistName: playlist.name,
        })
        setZipResultDialogOpen(true)
      } catch (err) {
        setZipResult({
          ok: false,
          message:
            err instanceof Error ? err.message : "M3U ZIP import failed.",
          uploadedTracks: [],
          playlistName: null,
        })
        setZipResultDialogOpen(true)
      } finally {
        setZipImportRunning(false)
      }
    },
    [onUploadComplete, uploadingAll, zipImportRunning]
  )

  return (
    <div className="glass-card mb-8 rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="card-label">Upload Tracks</p>
        <button
          onClick={onCancel}
          className="text-muted-foreground transition-colors hover:text-foreground"
          disabled={uploadingAll || zipImportRunning}
          aria-label="Close uploader"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => audioInputRef.current?.click()}
          disabled={uploadingAll || zipImportRunning}
        >
          <Plus />
          Add audio files
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => zipInputRef.current?.click()}
          disabled={uploadingAll || zipImportRunning}
        >
          <FileArchive />
          M3U ZIP upload
        </Button>
        <input
          ref={audioInputRef}
          type="file"
          accept={AUDIO_TYPES}
          multiple
          onChange={(e) => {
            if (e.target.files) void addAudioFiles(e.target.files)
            e.currentTarget.value = ""
          }}
          className="hidden"
        />
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleM3uZipUpload(file)
            e.currentTarget.value = ""
          }}
          className="hidden"
        />
      </div>

      <div
        onClick={() => audioInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setAudioDragging(true)
        }}
        onDragLeave={() => setAudioDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setAudioDragging(false)
          if (e.dataTransfer.files.length > 0) {
            void addAudioFiles(e.dataTransfer.files)
          }
        }}
        className={cn(
          "mb-4 flex min-h-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-all",
          audioDragging
            ? "border-foreground/40 bg-foreground/8"
            : "border-foreground/10 hover:border-foreground/20"
        )}
      >
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <CloudUpload className="h-6 w-6" />
          <span className="text-sm">
            {audioDragging
              ? "Drop audio files here"
              : "Drop or choose audio files"}
          </span>
          <span className="text-xs opacity-60">Batch upload supported</span>
        </div>
      </div>

      {zipImportRunning && (
        <div className="mb-4 rounded-xl border border-foreground/10 bg-foreground/2 p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{zipProgressLabel || "Processing M3U ZIP"}</span>
            <span>{zipProgress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: `${zipProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-4">
        {items.map((item, index) => (
          <TrackCard
            key={item.id}
            item={item}
            index={index}
            disabled={uploadingAll || zipImportRunning}
            onPatch={(patch) => updateItem(item.id, patch)}
            onRemove={() =>
              setItems((prev) => prev.filter((x) => x.id !== item.id))
            }
            onSetCover={(file) => void setCoverFor(item.id, file)}
            onSetLyrics={(file) => setLyricsFor(item.id, file)}
            onFetchLyrics={() =>
              void fetchLyricsForItem(
                item.id,
                item.title,
                item.artist,
                item.durationSec,
                item.album
              )
            }
            onUseFetchedLyrics={() => applyFetchedLyrics(item.id)}
            onDismissFetchedLyrics={() =>
              updateItem(item.id, {
                lyricsStatus: "not-found",
                fetchedLyrics: null,
              })
            }
          />
        ))}
      </div>

      {globalError && (
        <p className="mt-3 text-sm text-destructive">{globalError}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground/70">
          {items.length} {items.length === 1 ? "track" : "tracks"} queued
          {invalidCount > 0 ? ` · ${invalidCount} need metadata` : ""}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={uploadingAll || zipImportRunning}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void uploadAll()}
            disabled={items.length === 0 || uploadingAll || zipImportRunning}
          >
            {uploadingAll ? "Uploading..." : `Upload all (${items.length})`}
          </Button>
        </div>
      </div>

      <Dialog open={zipResultDialogOpen} onOpenChange={setZipResultDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {zipResult?.ok
                ? "M3U ZIP import complete"
                : "M3U ZIP import failed"}
            </DialogTitle>
            <DialogDescription>{zipResult?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setZipResultDialogOpen(false)
                if (zipResult?.ok) onCancel()
              }}
            >
              {zipResult?.ok ? "Done" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TrackCard({
  item,
  index,
  disabled,
  onPatch,
  onRemove,
  onSetCover,
  onSetLyrics,
  onFetchLyrics,
  onUseFetchedLyrics,
  onDismissFetchedLyrics,
}: {
  item: UploadItem
  index: number
  disabled: boolean
  onPatch: (patch: Partial<UploadItem>) => void
  onRemove: () => void
  onSetCover: (file: File) => void
  onSetLyrics: (file: File) => void
  onFetchLyrics: () => void
  onUseFetchedLyrics: () => void
  onDismissFetchedLyrics: () => void
}) {
  const coverInputRef = useRef<HTMLInputElement>(null)
  const lyricsInputRef = useRef<HTMLInputElement>(null)
  const genreListId = `genre-list-${item.id}`

  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/2 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {index + 1}. {item.audioFile.name}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {(item.audioFile.size / 1024 / 1024).toFixed(1)} MB
            {item.durationSec > 0
              ? ` · ${Math.floor(item.durationSec / 60)}:${String(item.durationSec % 60).padStart(2, "0")}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {item.status === "uploading" && (
            <Spinner
              size="md"
              clockwise
              className="text-muted-foreground"
            />
          )}
          {item.status === "success" && (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground transition-colors hover:text-foreground"
            disabled={disabled || item.status === "uploading"}
            aria-label="Remove track"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={disabled}
            className={cn(
              "relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-all",
              "border-foreground/10 hover:border-foreground/20 disabled:opacity-50"
            )}
          >
            {item.coverPreview ? (
              <img
                src={item.coverPreview}
                alt="Cover"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <Music2 className="h-5 w-5" />
                <span className="text-[10px]">Cover</span>
              </div>
            )}
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept={COVER_TYPES}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onSetCover(f)
              e.currentTarget.value = ""
            }}
            className="hidden"
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" required>
              <input
                type="text"
                value={item.title}
                onChange={(e) =>
                  onPatch({ title: e.target.value, error: null })
                }
                maxLength={200}
                placeholder="Track title"
                className="input-glass"
                disabled={disabled}
              />
            </Field>
            <Field label="Artist" required>
              <input
                type="text"
                value={item.artist}
                onChange={(e) =>
                  onPatch({ artist: e.target.value, error: null })
                }
                maxLength={200}
                placeholder="Artist name"
                className="input-glass"
                disabled={disabled}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Album">
              <input
                type="text"
                value={item.album}
                onChange={(e) => onPatch({ album: e.target.value })}
                maxLength={200}
                placeholder="Album name"
                className="input-glass"
                disabled={disabled}
              />
            </Field>
            <Field label="Genre">
              <input
                type="text"
                list={genreListId}
                value={item.genre}
                onChange={(e) => onPatch({ genre: e.target.value })}
                maxLength={100}
                placeholder="e.g. Electronic"
                className="input-glass"
                disabled={disabled}
              />
              <datalist id={genreListId}>
                {GENRES.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Field>
          </div>

          <Field label="Lyrics file">
            {item.lyricsStatus === "searching" ? (
              <div className="input-glass flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="md" clockwise className="text-muted-foreground" />
                <span>Searching LRCLIB for lyrics...</span>
              </div>
            ) : item.lyricsStatus === "found" && item.fetchedLyrics ? (
              <div className="overflow-hidden rounded-xl border border-foreground/10 bg-foreground/2">
                <div className="flex items-center justify-between gap-2 border-b border-foreground/8 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Lyrics found on LRCLIB</span>
                    <span className="rounded bg-foreground/8 px-1.5 py-0.5 text-[10px] tracking-wider uppercase">
                      {item.fetchedLyricsType === "lrc" ? "synced" : "plain"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-muted-foreground"
                      onClick={onDismissFetchedLyrics}
                      disabled={disabled}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={onUseFetchedLyrics}
                      disabled={disabled}
                    >
                      Use lyrics
                    </Button>
                  </div>
                </div>
                <pre className="max-h-40 overflow-y-auto px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
                  {item.fetchedLyrics}
                </pre>
              </div>
            ) : (
              <div>
                {(item.lyricsStatus === "not-found" ||
                  item.lyricsStatus === "error" ||
                  item.lyricsStatus === "instrumental") && (
                  <p className="mb-1.5 text-xs text-muted-foreground/60">
                    {item.lyricsStatus === "instrumental"
                      ? "Instrumental track detected."
                      : item.lyricsStatus === "error"
                        ? "Lyrics lookup failed."
                        : "No lyrics found on LRCLIB."}{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-muted-foreground"
                      onClick={onFetchLyrics}
                      disabled={disabled}
                    >
                      Try again
                    </button>
                  </p>
                )}
                <div
                  onClick={() => !disabled && lyricsInputRef.current?.click()}
                  className={cn(
                    "input-glass flex cursor-pointer items-center gap-2 text-left text-sm transition-colors",
                    disabled && "cursor-not-allowed opacity-50"
                  )}
                >
                  {item.lyricsFile ? (
                    <>
                      <FileMusic className="h-3.5 w-3.5 shrink-0 text-foreground/60" />
                      <span className="truncate text-foreground">
                        {item.lyricsFile.name}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!disabled)
                            onPatch({
                              lyricsFile: null,
                              lyricsStatus: "idle",
                              fetchedLyrics: null,
                              error: null,
                            })
                        }}
                        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                        disabled={disabled}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      Drop or choose .lrc / .txt
                    </span>
                  )}
                </div>
                <input
                  ref={lyricsInputRef}
                  type="file"
                  accept=".lrc,.txt,text/plain"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onSetLyrics(f)
                    e.currentTarget.value = ""
                  }}
                  className="hidden"
                />
              </div>
            )}
          </Field>
        </div>
      </div>

      {item.status === "uploading" && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Uploading...</span>
            <span>{item.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        </div>
      )}

      {item.error && (
        <p className="mt-2 text-sm text-destructive">{item.error}</p>
      )}
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  )
}
