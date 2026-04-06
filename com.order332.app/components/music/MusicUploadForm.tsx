"use client"

import { useCallback, useRef, useState } from "react"
import { parseBlob } from "music-metadata"
import { CloudUpload, FileMusic, Loader2, Music, Music2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { uploadMusicTrack, type MusicTrackMeta } from "@/lib/music-api"
import { useAuthStore } from "@/lib/auth-store"
import { Button } from "@/components/ui/button"

const AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/ogg", "audio/wav", "audio/flac", "audio/aac", "audio/mp4", "audio/x-m4a"])
const AUDIO_TYPES = [...AUDIO_MIME_TYPES].join(",")
const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"].join(",")
const LYRICS_EXTS = new Set([".lrc", ".txt"])

const GENRES = ["Pop", "Rock", "Hip-Hop", "Electronic", "Jazz", "Classical", "R&B", "Country", "Folk", "Ambient", "Metal", "Punk", "Indie", "Soul", "Reggae"]

interface MusicUploadFormProps {
  onUploadComplete: (track: MusicTrackMeta) => void
  onCancel: () => void
}

function isLyricsFile(file: File) {
  return LYRICS_EXTS.has(file.name.slice(file.name.lastIndexOf(".")).toLowerCase())
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
  const [album, setAlbum] = useState("")
  const [genre, setGenre] = useState("")
  const [durationSec, setDurationSec] = useState(0)

  type LyricsSearchStatus = 'idle' | 'searching' | 'found' | 'not-found' | 'instrumental' | 'error'
  const [lyricsStatus, setLyricsStatus] = useState<LyricsSearchStatus>('idle')
  const [fetchedLyrics, setFetchedLyrics] = useState<string | null>(null)
  const [fetchedLyricsType, setFetchedLyricsType] = useState<'lrc' | 'txt'>('lrc')

  const [audioDragging, setAudioDragging] = useState(false)
  const [lyricsDragging, setLyricsDragging] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const doFetchLyrics = useCallback(async (trackTitle: string, trackArtist: string, trackDuration: number, trackAlbum: string) => {
    if (!trackTitle.trim() || trackDuration === 0) return
    setLyricsStatus('searching')

    const params = new URLSearchParams({ track_name: trackTitle.trim(), duration: String(trackDuration) })
    if (trackArtist.trim()) params.set('artist_name', trackArtist.trim())
    if (trackAlbum.trim()) params.set('album_name', trackAlbum.trim())

    try {
      const accessToken = useAuthStore.getState().accessToken
      const res = await fetch(`/api/music/tracks/lyrics/search?${params}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      })

      if (!res.ok || !res.body) { setLyricsStatus('error'); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventType = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const payload = line.slice(6)
            if (eventType === 'not_found') {
              setLyricsStatus('not-found')
            } else if (eventType === 'error') {
              setLyricsStatus('error')
            } else if (eventType === 'result') {
              try {
                const data = JSON.parse(payload) as { syncedLyrics: string | null; plainLyrics: string | null; instrumental: boolean }
                if (data.instrumental) {
                  setLyricsStatus('instrumental')
                } else if (data.syncedLyrics) {
                  setFetchedLyrics(data.syncedLyrics)
                  setFetchedLyricsType('lrc')
                  setLyricsStatus('found')
                } else if (data.plainLyrics) {
                  setFetchedLyrics(data.plainLyrics)
                  setFetchedLyricsType('txt')
                  setLyricsStatus('found')
                } else {
                  setLyricsStatus('not-found')
                }
              } catch { setLyricsStatus('error') }
            }
            eventType = ''
          }
        }
      }
    } catch {
      setLyricsStatus('error')
    }
  }, [])

  const useFetchedLyrics = useCallback(() => {
    if (!fetchedLyrics) return
    const ext = fetchedLyricsType === 'lrc' ? '.lrc' : '.txt'
    const blob = new Blob([fetchedLyrics], { type: 'text/plain' })
    const file = new File([blob], `lyrics${ext}`, { type: 'text/plain' })
    setLyricsFile(file)
    setLyricsStatus('idle')
    setFetchedLyrics(null)
  }, [fetchedLyrics, fetchedLyricsType])

  const handleAudioFile = useCallback(async (file: File) => {
    if (!AUDIO_MIME_TYPES.has(file.type) && !file.name.match(/\.(mp3|ogg|wav|flac|aac|m4a)$/i)) {
      setError("Unsupported audio format.")
      return
    }
    setAudioFile(file)
    setError(null)

    // Parse embedded metadata (ID3, Vorbis, etc.) using music-metadata browser build
    try {
      const meta = await parseBlob(file)
      const { common, format } = meta

      if (common.title?.trim()) setTitle(common.title.trim())
      else setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "))

      if (common.artist?.trim()) setArtist(common.artist.trim())
      else if (common.albumartist?.trim()) setArtist(common.albumartist.trim())

      if (common.genre?.[0]?.trim()) setGenre(common.genre[0].trim())
      if (common.album?.trim()) setAlbum(common.album.trim())

      if (format.duration) setDurationSec(Math.round(format.duration))

      // Extract embedded cover art — normalise to PNG via canvas for cross-browser safety
      if (common.picture?.length) {
        const pic = common.picture[0]
        const srcBlob = new Blob([pic.data.buffer.slice(pic.data.byteOffset, pic.data.byteOffset + pic.data.byteLength) as ArrayBuffer], { type: pic.format || "image/jpeg" })
        const srcUrl = URL.createObjectURL(srcBlob)
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          canvas.getContext("2d")?.drawImage(img, 0, 0)
          URL.revokeObjectURL(srcUrl)
          canvas.toBlob((pngBlob) => {
            if (!pngBlob) return
            const pngFile = new File([pngBlob], "cover.png", { type: "image/png" })
            setCoverFile(pngFile)
            const reader = new FileReader()
            reader.onload = (e) => setCoverPreview(e.target?.result as string)
            reader.readAsDataURL(pngFile)
          }, "image/png")
        }
        img.onerror = () => URL.revokeObjectURL(srcUrl)
        img.src = srcUrl
      }

      // Auto-fetch lyrics if no manual lyrics file present
      void doFetchLyrics(
        common.title?.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        common.artist?.trim() || common.albumartist?.trim() || "",
        format.duration ? Math.round(format.duration) : 0,
        common.album?.trim() || "",
      )
    } catch {
      // Fallback: just use filename for title and Web Audio for duration
      const fallbackTitle = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
      setTitle(fallbackTitle)
      const objectUrl = URL.createObjectURL(file)
      const audio = new Audio(objectUrl)
      audio.addEventListener("loadedmetadata", () => {
        const dur = Math.round(audio.duration) || 0
        setDurationSec(dur)
        URL.revokeObjectURL(objectUrl)
        void doFetchLyrics(fallbackTitle, "", dur, "")
      })
    }
  }, [doFetchLyrics])

  const handleCoverFile = useCallback((file: File) => {
    setCoverFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setCoverPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleLyricsFile = useCallback((file: File) => {
    if (!isLyricsFile(file)) {
      setError("Lyrics must be a .lrc or .txt file.")
      return
    }
    setLyricsFile(file)
    setLyricsStatus('idle')
    setFetchedLyrics(null)
    setError(null)
  }, [])

  // Audio drop zone handlers
  const onAudioDragOver = (e: React.DragEvent) => { e.preventDefault(); setAudioDragging(true) }
  const onAudioDragLeave = () => setAudioDragging(false)
  const onAudioDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setAudioDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleAudioFile(file)
  }

  // Lyrics drop zone handlers
  const onLyricsDragOver = (e: React.DragEvent) => { e.preventDefault(); setLyricsDragging(true) }
  const onLyricsDragLeave = () => setLyricsDragging(false)
  const onLyricsDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setLyricsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleLyricsFile(file)
  }

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
        { title: title.trim(), artist: artist.trim(), album: album.trim() || null, genre: genre.trim() || null, durationSec },
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
            <Field label="Album">
              <input
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                maxLength={200}
                placeholder="Album name"
                className="input-glass"
              />
            </Field>
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
          </div>

          {/* Lyrics — LRCLIB auto-fetch + manual override */}
          <Field label="Lyrics file">
            {lyricsStatus === 'searching' ? (
              <div className="input-glass flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                Searching LRCLIB for lyrics…
              </div>
            ) : lyricsStatus === 'found' && fetchedLyrics ? (
              <div className="rounded-xl border border-foreground/10 bg-foreground/2 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-foreground/8">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Music className="h-3.5 w-3.5 shrink-0" />
                    <span>Lyrics found on LRCLIB</span>
                    <span className="rounded bg-foreground/8 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                      {fetchedLyricsType === 'lrc' ? 'synced' : 'plain'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => { setLyricsStatus('not-found'); setFetchedLyrics(null) }}>
                      Dismiss
                    </Button>
                    <Button size="sm" className="h-6 px-2 text-xs" onClick={useFetchedLyrics}>
                      Use lyrics
                    </Button>
                  </div>
                </div>
                <pre className="max-h-40 overflow-y-auto px-3 py-2 font-mono text-xs text-muted-foreground whitespace-pre-wrap leading-5">
                  {fetchedLyrics}
                </pre>
              </div>
            ) : lyricsStatus === 'instrumental' ? (
              <div
                onClick={() => lyricsInputRef.current?.click()}
                onDragOver={onLyricsDragOver}
                onDragLeave={onLyricsDragLeave}
                onDrop={onLyricsDrop}
                className={cn(
                  "input-glass flex cursor-pointer items-center gap-2 text-left text-sm transition-colors",
                  lyricsDragging && "border-foreground/40 bg-foreground/8",
                )}
              >
                <span className="text-muted-foreground/60 text-xs">Instrumental track · drop custom .lrc if needed</span>
                <input ref={lyricsInputRef} type="file" accept=".lrc,.txt,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLyricsFile(f) }} className="hidden" />
              </div>
            ) : (
              /* idle / not-found / error — show drop zone */
              <div>
                {lyricsStatus === 'not-found' && (
                  <p className="mb-1.5 text-xs text-muted-foreground/60">No lyrics found on LRCLIB · add manually or <button type="button" className="underline underline-offset-2 hover:text-muted-foreground" onClick={() => doFetchLyrics(title, artist, durationSec, album)}>try again</button></p>
                )}
                <div
                  onClick={() => lyricsInputRef.current?.click()}
                  onDragOver={onLyricsDragOver}
                  onDragLeave={onLyricsDragLeave}
                  onDrop={onLyricsDrop}
                  className={cn(
                    "input-glass flex cursor-pointer items-center gap-2 text-left text-sm transition-colors",
                    lyricsDragging && "border-foreground/40 bg-foreground/8",
                  )}
                >
                  {lyricsFile ? (
                    <>
                      <FileMusic className="h-3.5 w-3.5 shrink-0 text-foreground/60" />
                      <span className="truncate text-foreground">{lyricsFile.name}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLyricsFile(null) }}
                        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {lyricsDragging ? "Drop .lrc or .txt here" : "Drop or choose .lrc / .txt"}
                    </span>
                  )}
                </div>
                <input ref={lyricsInputRef} type="file" accept=".lrc,.txt,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLyricsFile(f) }} className="hidden" />
              </div>
            )}
          </Field>
        </div>
      </div>

      {/* Audio file drop zone */}
      <div
        onClick={() => !audioFile && audioInputRef.current?.click()}
        onDragOver={onAudioDragOver}
        onDragLeave={onAudioDragLeave}
        onDrop={onAudioDrop}
        className={cn(
          "mt-4 flex min-h-20 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-all",
          audioFile
            ? "cursor-default border-foreground/10 bg-foreground/2"
            : audioDragging
              ? "border-foreground/40 bg-foreground/8"
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
            <button onClick={(e) => { e.stopPropagation(); setAudioFile(null); setDurationSec(0); setAlbum(""); setLyricsStatus('idle'); setFetchedLyrics(null) }} className="ml-4 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <CloudUpload className="h-6 w-6" />
            <span className="text-sm">{audioDragging ? "Drop audio file here" : "Drop or choose audio file"}</span>
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
