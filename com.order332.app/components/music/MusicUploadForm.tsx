"use client"

import { useCallback, useRef, useState } from "react"
import { CloudUpload, Music2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { uploadMusicTrack, type MusicTrackMeta } from "@/lib/music-api"
import { Button } from "@/components/ui/button"

const AUDIO_TYPES = ["audio/mpeg", "audio/ogg", "audio/wav", "audio/flac", "audio/aac", "audio/mp4", "audio/x-m4a"].join(",")
const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"].join(",")
const LYRICS_TYPES = ".lrc,.txt,text/plain"

const GENRES = ["Pop", "Rock", "Hip-Hop", "Electronic", "Jazz", "Classical", "R&B", "Country", "Folk", "Ambient", "Metal", "Punk", "Indie", "Soul", "Reggae"]

interface MusicUploadFormProps {
  onUploadComplete: (track: MusicTrackMeta) => void
  onCancel: () => void
}

export function MusicUploadForm({ onUploadComplete, onCancel }: MusicUploadFormProps) {
  const audioInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const lyricsInputRef = useRef<HTMLInputElement>(null)

  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [lyricsFile, setLyricsFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [artist, setArtist] = useState("")
  const [genre, setGenre] = useState("")
  const [durationSec, setDurationSec] = useState(0)

  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleAudioFile = useCallback((file: File) => {
    setAudioFile(file)
    setError(null)
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "))

    // Auto-detect duration
    const objectUrl = URL.createObjectURL(file)
    const audio = new Audio(objectUrl)
    audio.addEventListener("loadedmetadata", () => {
      setDurationSec(Math.round(audio.duration) || 0)
      URL.revokeObjectURL(objectUrl)
    })
  }, [title])

  const handleCoverFile = useCallback((file: File) => {
    setCoverFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setCoverPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleUpload = async () => {
    if (!audioFile || !title.trim() || !artist.trim()) return
    setUploading(true)
    setError(null)
    setProgress(0)

    try {
      const { track } = await uploadMusicTrack(
        audioFile,
        coverFile,
        lyricsFile,
        { title: title.trim(), artist: artist.trim(), genre: genre.trim() || undefined, durationSec },
        setProgress,
      )
      onUploadComplete(track)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
      setUploading(false)
    }
  }

  const isValid = !!audioFile && title.trim().length > 0 && artist.trim().length > 0

  return (
    <div className="glass-card mb-8 rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="card-label">Upload Track</p>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        {/* Cover art picker */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className={cn(
              "relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-all",
              "border-foreground/10 hover:border-foreground/20",
            )}
          >
            {coverPreview ? (
              <img src={coverPreview} alt="Cover" className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                <Music2 className="h-6 w-6" />
                <span className="text-xs">Cover art</span>
              </div>
            )}
          </button>
          <input ref={coverInputRef} type="file" accept={COVER_TYPES} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverFile(f) }} className="hidden" />
          <span className="text-xs text-muted-foreground/60">Optional · max 5 MB</span>
        </div>

        {/* Metadata fields */}
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" required>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Track title"
                className="input-glass"
              />
            </Field>
            <Field label="Artist" required>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                maxLength={200}
                placeholder="Artist name"
                className="input-glass"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Genre">
              <input
                type="text"
                list="genre-list"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                maxLength={100}
                placeholder="e.g. Electronic"
                className="input-glass"
              />
              <datalist id="genre-list">
                {GENRES.map((g) => <option key={g} value={g} />)}
              </datalist>
            </Field>

            <Field label="Lyrics file">
              <button
                type="button"
                onClick={() => lyricsInputRef.current?.click()}
                className="input-glass flex items-center gap-2 text-left text-sm text-muted-foreground"
              >
                {lyricsFile ? (
                  <span className="truncate text-foreground">{lyricsFile.name}</span>
                ) : (
                  <span>Choose .lrc or .txt</span>
                )}
              </button>
              <input ref={lyricsInputRef} type="file" accept={LYRICS_TYPES} onChange={(e) => { const f = e.target.files?.[0]; if (f) setLyricsFile(f) }} className="hidden" />
            </Field>
          </div>
        </div>
      </div>

      {/* Audio file picker */}
      <div
        onClick={() => !audioFile && audioInputRef.current?.click()}
        className={cn(
          "mt-4 flex min-h-20 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-all",
          audioFile
            ? "cursor-default border-foreground/10 bg-foreground/2"
            : "border-foreground/10 hover:border-foreground/20",
        )}
      >
        <input ref={audioInputRef} type="file" accept={AUDIO_TYPES} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioFile(f) }} className="hidden" />
        {audioFile ? (
          <div className="flex w-full items-center justify-between px-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{audioFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                {durationSec > 0 && ` · ${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`}
              </p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setAudioFile(null); setDurationSec(0) }} className="ml-4 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <CloudUpload className="h-6 w-6" />
            <span className="text-sm">Choose audio file</span>
            <span className="text-xs opacity-60">MP3, FLAC, WAV, OGG, AAC · max 100 MB</span>
          </div>
        )}
      </div>

      {/* Progress */}
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

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-4 flex justify-end gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={uploading}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleUpload} disabled={!isValid || uploading}>
          {uploading ? "Uploading…" : "Upload Track"}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
        {label}{required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  )
}
