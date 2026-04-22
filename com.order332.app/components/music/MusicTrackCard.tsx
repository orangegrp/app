"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react"
import {
  ListEnd,
  ListStart,
  MoreHorizontal,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Share2,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  formatDuration,
  fetchTrackLyrics,
  generateAiLyrics,
  type LyricsType,
  type MusicTrackMeta,
  type MusicPlaylistMeta,
  type MusicTrackUpdateMeta,
  uploadMusicTrackAsset,
} from "@/lib/music-api"
import { useAuthStore } from "@/lib/auth-store"
import {
  AI_LYRICS_LANGUAGE_OPTIONS,
  type AiLyricsLanguageCode,
} from "@/lib/lyrics-ai-languages"
import { hasRenderableGenre } from "@/lib/music-genre"
import { FormattedGenre } from "./FormattedGenre"
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ShareTrackDialog } from "@/components/music/ShareTrackDialog"
import { LyricsEditorDialog } from "@/components/music/LyricsEditorDialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useLongPress } from "@/hooks/use-long-press"

type PointerPoint = {
  clientX: number
  clientY: number
}

const COVER_ACCEPT = ["image/jpeg", "image/png", "image/webp"].join(",")
const LYRICS_ACCEPT = ".lrc,.txt,text/plain"
const WAVEFORM_HEIGHTS = [78, 62, 88]

type LyricsSearchStatus =
  | "idle"
  | "searching"
  | "found"
  | "not-found"
  | "instrumental"
  | "error"

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

interface MusicTrackCardProps {
  track: MusicTrackMeta
  isActive: boolean
  isPlaying: boolean
  onPlay: () => void
  isCreator: boolean
  onDelete: (id: string) => void
  onEdit: (id: string, meta: MusicTrackUpdateMeta) => Promise<void>
  onAddToQueue?: (id: string) => void
  onPlayNext?: (id: string) => void
  playlists?: MusicPlaylistMeta[]
  onAddToPlaylist?: (playlistId: string, trackId: string) => Promise<void>
}

export function MusicTrackCard({
  track,
  isActive,
  isPlaying,
  onPlay,
  isCreator,
  onDelete,
  onEdit,
  onAddToQueue,
  onPlayNext,
  playlists,
  onAddToPlaylist,
}: MusicTrackCardProps) {
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const suppressTapRef = useRef(false)
  const menuTriggerRef = useRef<HTMLDivElement | null>(null)
  const lastPointerRef = useRef<PointerPoint | null>(null)

  const rememberPointer = useCallback((point?: PointerPoint | null) => {
    if (!point) {
      lastPointerRef.current = null
      return
    }
    lastPointerRef.current = { clientX: point.clientX, clientY: point.clientY }
  }, [])

  const triggerContextMenu = useCallback((point?: PointerPoint | null) => {
    if (typeof window === "undefined" || !menuTriggerRef.current) return
    const rect = menuTriggerRef.current.getBoundingClientRect()
    const clientX = point?.clientX ?? rect.left + rect.width / 2
    const clientY = point?.clientY ?? rect.top + rect.height / 2
    const evt = new window.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX,
      clientY,
    })
    menuTriggerRef.current.dispatchEvent(evt)
  }, [])

  const baseLongPressHandlers = useLongPress(() => {
    suppressTapRef.current = true
    triggerContextMenu(lastPointerRef.current)
  })
  const longPressHandlers = {
    ...baseLongPressHandlers,
    onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => {
      rememberPointer(event.nativeEvent)
      baseLongPressHandlers.onMouseDown?.()
    },
    onTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0]
      if (touch) rememberPointer(touch)
      baseLongPressHandlers.onTouchStart?.()
    },
    onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => {
      rememberPointer(event.nativeEvent)
      event.stopPropagation()
      baseLongPressHandlers.onContextMenu?.(event)
      triggerContextMenu(event.nativeEvent)
    },
  }
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const handleMenuAction = useCallback((action?: () => void) => {
    action?.()
  }, [])
  const coverInputRef = useRef<HTMLInputElement>(null)
  const lyricsInputRef = useRef<HTMLInputElement>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(
    track.coverUrl ?? null
  )
  const [lyricsFile, setLyricsFile] = useState<File | null>(null)
  const [lyricsStatus, setLyricsStatus] = useState<LyricsSearchStatus>("idle")
  const [fetchedLyrics, setFetchedLyrics] = useState<string | null>(null)
  const [fetchedLyricsType, setFetchedLyricsType] = useState<"lrc" | "txt">(
    "lrc"
  )
  const [fetchedLyricsSource, setFetchedLyricsSource] = useState<
    "lrclib" | "ai"
  >("lrclib")
  const [aiLanguageCode, setAiLanguageCode] =
    useState<AiLyricsLanguageCode>("en")
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorLyrics, setEditorLyrics] = useState("")
  const [editorLoading, setEditorLoading] = useState(false)
  useEffect(() => {
    if (!editOpen) {
      setCoverPreview(track.coverUrl ?? null)
      setCoverFile(null)
      setLyricsFile(null)
      setLyricsStatus("idle")
      setFetchedLyrics(null)
      setFetchedLyricsType("lrc")
      setFetchedLyricsSource("lrclib")
      setAiGenerating(false)
      setAiError(null)
    }
  }, [editOpen, track.coverUrl])
  const [editTitle, setEditTitle] = useState("")
  const [editArtist, setEditArtist] = useState("")
  const [editAlbum, setEditAlbum] = useState("")
  const [editGenre, setEditGenre] = useState("")
  const showingPlay = isActive && isPlaying
  const iconOverlayButton =
    "glass-button glass-button-glass pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border-white/30 bg-white/22 text-white backdrop-blur-2xl shadow-[0_10px_26px_rgba(0,0,0,0.4)] hover:bg-white/28"
  const playOverlayButton =
    "pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/18 ring-1 ring-white/30 backdrop-blur-xl shadow-[0_18px_36px_rgba(0,0,0,0.35)]"

  const openEdit = (e?: ReactMouseEvent) => {
    e?.stopPropagation()
    setEditTitle(track.title)
    setEditArtist(track.artist)
    setEditAlbum(track.album ?? "")
    setEditGenre(track.genre ?? "")
    setCoverPreview(track.coverUrl ?? null)
    setCoverFile(null)
    setLyricsFile(null)
    setEditOpen(true)
    void fetchLrclibLyrics(
      track.title,
      track.artist,
      track.durationSec,
      track.album ?? ""
    )
  }

  const fetchLrclibLyrics = useCallback(
    async (
      trackTitle: string,
      trackArtist: string,
      trackDuration: number,
      trackAlbum: string
    ) => {
      if (!trackTitle.trim()) {
        setLyricsStatus("error")
        setAiError("Track title is required for lyrics lookup.")
        return
      }
      if (trackDuration <= 0) {
        setLyricsStatus("error")
        setAiError(
          "Duration metadata missing. You can still generate AI lyrics manually."
        )
        return
      }
      setLyricsStatus("searching")
      setFetchedLyrics(null)
      setAiError(null)

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
          setLyricsStatus("error")
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
                setLyricsStatus("not-found")
              } else if (eventType === "error") {
                setLyricsStatus("error")
              } else if (eventType === "result") {
                const data = JSON.parse(payload) as {
                  syncedLyrics: string | null
                  plainLyrics: string | null
                  instrumental: boolean
                }
                if (data.instrumental) {
                  setLyricsStatus("instrumental")
                } else if (data.syncedLyrics) {
                  setLyricsStatus("found")
                  setFetchedLyrics(data.syncedLyrics)
                  setFetchedLyricsType("lrc")
                  setFetchedLyricsSource("lrclib")
                } else if (data.plainLyrics) {
                  setLyricsStatus("found")
                  setFetchedLyrics(data.plainLyrics)
                  setFetchedLyricsType("txt")
                  setFetchedLyricsSource("lrclib")
                } else {
                  setLyricsStatus("not-found")
                }
              }
              eventType = ""
            }
          }
        }
      } catch {
        setLyricsStatus("error")
      }
    },
    []
  )

  const applyFetchedLyrics = useCallback(() => {
    if (!fetchedLyrics) return
    const ext = fetchedLyricsType === "lrc" ? ".lrc" : ".txt"
    const file = new File(
      [new Blob([fetchedLyrics], { type: "text/plain" })],
      `lyrics${ext}`,
      {
        type: "text/plain",
      }
    )
    setLyricsFile(file)
    setFetchedLyrics(null)
    setLyricsStatus("idle")
    setAiGenerating(false)
    setAiError(null)
  }, [fetchedLyrics, fetchedLyricsType])

  const generateAiLyricsForTrack = useCallback(async () => {
    setAiGenerating(true)
    setAiError(null)
    try {
      const result = await generateAiLyrics({
        trackId: track.id,
        languageCode: aiLanguageCode,
        durationSec: track.durationSec,
      })
      setFetchedLyrics(result.lyrics)
      setFetchedLyricsType("lrc")
      setFetchedLyricsSource("ai")
      setLyricsStatus("found")
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "AI lyrics generation failed"
      )
    } finally {
      setAiGenerating(false)
    }
  }, [aiLanguageCode, track.durationSec, track.id])

  const openLyricsEditor = useCallback(async () => {
    setEditorLoading(true)
    try {
      if (lyricsFile) {
        setEditorLyrics(await lyricsFile.text())
      } else if (fetchedLyrics) {
        setEditorLyrics(fetchedLyrics)
      } else if (track.lyricsUrl) {
        const existing = await fetchTrackLyrics(track.id)
        setEditorLyrics(existing.content)
      } else {
        setEditorLyrics("")
      }
      setEditorOpen(true)
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "Could not load lyrics for editor"
      )
    } finally {
      setEditorLoading(false)
    }
  }, [fetchedLyrics, lyricsFile, track.id, track.lyricsUrl])

  const handleSave = async () => {
    if (!editTitle.trim() || !editArtist.trim()) return
    setSaving(true)
    try {
      let coverKey: string | null = null
      if (coverFile) {
        const upload = await uploadMusicTrackAsset("covers", coverFile)
        coverKey = upload.storageKey
      }

      let lyricsKey: string | null = null
      let lyricsType: LyricsType | null = null
      if (lyricsFile) {
        lyricsType = lyricsFile.name.toLowerCase().endsWith(".lrc")
          ? "lrc"
          : "txt"
        const upload = await uploadMusicTrackAsset("lyrics", lyricsFile)
        lyricsKey = upload.storageKey
      }

      const meta: MusicTrackUpdateMeta = {
        title: editTitle.trim(),
        artist: editArtist.trim(),
        album: editAlbum.trim() || null,
        genre: editGenre.trim() || null,
        ...(coverKey ? { coverKey } : {}),
        ...(lyricsKey ? { lyricsKey, lyricsType } : {}),
      }

      await onEdit(track.id, meta)
      setEditOpen(false)
    } catch (err) {
      console.error("[MusicTrackCard] save error", err)
    } finally {
      setSaving(false)
    }
  }
  const handleCoverFileSelect = useCallback((file: File) => {
    setCoverFile(file)
    const reader = new FileReader()
    reader.onload = (event) => {
      if (event.target?.result) {
        setCoverPreview(event.target.result as string)
      }
    }
    reader.readAsDataURL(file)
  }, [])

  const handleCoverInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    handleCoverFileSelect(file)
    event.target.value = ""
  }

  const handleLyricsInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLyricsFile(file)
    setFetchedLyrics(null)
    setLyricsStatus("idle")
    setAiError(null)
    event.target.value = ""
  }

  const handleDeleteConfirm = () => {
    setDeleting(true)
    setConfirmOpen(false)
    onDelete(track.id)
  }

  return (
    <div
      {...longPressHandlers}
      onClickCapture={(event) => {
        if (!suppressTapRef.current) return
        event.preventDefault()
        event.stopPropagation()
        suppressTapRef.current = false
      }}
      className={cn(
        "glass-card group relative flex flex-col overflow-hidden rounded-xl transition-all select-none",
        isActive && "ring-1 ring-foreground/30"
      )}
    >
      {/* Cover art */}
      <div className="relative aspect-square overflow-hidden bg-foreground/5">
        {track.coverUrl ? (
          <img
            src={track.coverUrl}
            alt={`${track.title} cover`}
            className={cn(
              "h-full w-full object-cover transition-transform duration-500",
              isActive && "scale-105"
            )}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Music2 className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-black/40" />

        <div className="pointer-events-none absolute inset-0">
          <div className="flex h-full flex-col justify-between p-3">
            <div className="absolute top-2 right-2 flex gap-1 transition-opacity">
              <button
                onClick={(e) => {
                  if (suppressTapRef.current) {
                    suppressTapRef.current = false
                    return
                  }
                  e.stopPropagation()
                  setShareOpen(true)
                }}
                type="button"
                className={iconOverlayButton}
                aria-label="Share track"
              >
                <Share2 className="h-3 w-3" />
              </button>
              <ContextMenu>
                <ContextMenuTrigger
                  className={iconOverlayButton}
                  aria-label="Show actions"
                  ref={menuTriggerRef}
                  onClick={(event) => {
                    if (suppressTapRef.current) {
                      suppressTapRef.current = false
                      return
                    }
                    event.stopPropagation()
                    const point =
                      event.nativeEvent.detail === 0 &&
                      event.nativeEvent.clientX === 0 &&
                      event.nativeEvent.clientY === 0
                        ? null
                        : event.nativeEvent
                    rememberPointer(point)
                    triggerContextMenu(point)
                  }}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => handleMenuAction(() => onPlay())}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {showingPlay ? "Pause" : "Play"}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() =>
                      handleMenuAction(() => onPlayNext?.(track.id))
                    }
                  >
                    <ListStart className="h-3.5 w-3.5" />
                    Play next
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() =>
                      handleMenuAction(() => onAddToQueue?.(track.id))
                    }
                  >
                    <ListEnd className="h-3.5 w-3.5" />
                    Add to queue
                  </ContextMenuItem>
                  {playlists && onAddToPlaylist && (
                    <ContextMenuItem
                      onClick={() =>
                        handleMenuAction(() => setPlaylistOpen(true))
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add to playlist
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem
                    onClick={() => handleMenuAction(() => setShareOpen(true))}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </ContextMenuItem>
                  {isCreator && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => handleMenuAction(() => openEdit())}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit track
                      </ContextMenuItem>
                      <ContextMenuItem
                        variant="destructive"
                        onClick={() =>
                          handleMenuAction(() => setConfirmOpen(true))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete track
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            </div>
            <div className="flex flex-1 items-center justify-center">
              <button
                onClick={(e) => {
                  if (suppressTapRef.current) {
                    suppressTapRef.current = false
                    return
                  }
                  e.stopPropagation()
                  onPlay()
                }}
                type="button"
                className={cn(
                  playOverlayButton,
                  showingPlay ? "bg-white/20" : "hover:bg-white/20"
                )}
                aria-label={showingPlay ? "Pause track" : "Play track"}
              >
                {showingPlay ? (
                  <Pause className="h-5 w-5 fill-white text-white" />
                ) : (
                  <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Active waveform indicator */}
        {isActive && (
          <div className="absolute bottom-2 left-2">
            <div className="flex h-4 items-end gap-0.5">
              {WAVEFORM_HEIGHTS.map((height, i) => (
                <div
                  key={height}
                  className={cn(
                    "w-1 rounded-full bg-white",
                    isPlaying && "animate-bounce"
                  )}
                  style={{
                    height: `${height}%`,
                    animationDelay: `${(i + 1) * 0.1}s`,
                    animationDuration: "0.6s",
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="truncate text-sm font-medium text-foreground">
          {track.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
        {track.album && (
          <p className="truncate text-xs text-muted-foreground/60 italic">
            {track.album}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          {hasRenderableGenre(track.genre) && (
            <FormattedGenre
              genre={track.genre}
              className="min-w-0 flex-1 justify-start"
            />
          )}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground/60 tabular-nums">
            {formatDuration(track.durationSec)}
          </span>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          if (!o) setEditOpen(false)
        }}
      >
        <DialogContent
          showCloseButton={false}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Edit track</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
                className="input-glass w-full"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Artist <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={editArtist}
                onChange={(e) => setEditArtist(e.target.value)}
                maxLength={200}
                className="input-glass w-full"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Album
              </label>
              <input
                type="text"
                value={editAlbum}
                onChange={(e) => setEditAlbum(e.target.value)}
                maxLength={200}
                placeholder="e.g. Midnight Rain"
                className="input-glass w-full"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Genre
              </label>
              <input
                type="text"
                list="edit-genre-list"
                value={editGenre}
                onChange={(e) => setEditGenre(e.target.value)}
                maxLength={100}
                placeholder="e.g. Electronic"
                className="input-glass w-full"
              />
              <datalist id="edit-genre-list">
                {GENRES.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-xs tracking-wider text-muted-foreground">
                Cover art
              </label>
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="flex h-32 items-center justify-center rounded-xl border border-dashed border-foreground/10 bg-foreground/5 transition hover:border-foreground/30"
              >
                {coverPreview ? (
                  <img
                    src={coverPreview}
                    alt="Cover preview"
                    className="h-full w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                    <Music2 className="h-5 w-5" />
                    <span>Upload JPG, PNG, WebP</span>
                  </div>
                )}
              </button>
              <p className="text-[11px] text-muted-foreground/60">
                Optional · JPG, PNG, WebP
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs tracking-wider text-muted-foreground">
                Lyrics file
              </label>
              <button
                type="button"
                onClick={() => lyricsInputRef.current?.click()}
                className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-foreground/10 bg-foreground/5 text-xs text-muted-foreground transition hover:border-foreground/30"
              >
                <span className="text-center">
                  {lyricsFile?.name ??
                    (track.lyricsUrl
                      ? "Current lyrics attached"
                      : "Upload .lrc or .txt")}
                </span>
              </button>
              <p className="text-[11px] text-muted-foreground/60">
                Optional · LRCLIB-ready (.lrc or .txt)
              </p>

              {lyricsStatus === "searching" ? (
                <div className="rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Spinner
                      size="md"
                      clockwise
                      className="text-muted-foreground"
                    />
                    Searching LRCLIB...
                  </div>
                </div>
              ) : lyricsStatus === "found" && fetchedLyrics ? (
                <div className="overflow-hidden rounded-lg border border-foreground/10 bg-foreground/4">
                  <div className="flex items-center justify-between gap-2 border-b border-foreground/8 px-2 py-1.5">
                    <div className="text-[11px] text-muted-foreground">
                      {fetchedLyricsSource === "ai"
                        ? "AI lyrics generated"
                        : "LRCLIB lyrics found"}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => void openLyricsEditor()}
                        disabled={editorLoading}
                      >
                        Open editor
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => {
                          setFetchedLyrics(null)
                          setLyricsStatus("not-found")
                        }}
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={applyFetchedLyrics}
                      >
                        Use lyrics
                      </Button>
                    </div>
                  </div>
                  <pre className="max-h-36 overflow-y-auto px-2 py-2 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
                    {fetchedLyrics}
                  </pre>
                </div>
              ) : (
                (lyricsStatus === "not-found" ||
                  lyricsStatus === "error" ||
                  lyricsStatus === "instrumental") && (
                  <div className="rounded-lg border border-foreground/10 bg-foreground/4 p-2">
                    <p className="mb-2 text-[11px] text-muted-foreground/70">
                      {lyricsStatus === "instrumental"
                        ? "Instrumental track detected."
                        : lyricsStatus === "error"
                          ? "Lyrics lookup failed."
                          : "No lyrics found on LRCLIB."}{" "}
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-muted-foreground"
                        onClick={() =>
                          void fetchLrclibLyrics(
                            editTitle,
                            editArtist,
                            track.durationSec,
                            editAlbum
                          )
                        }
                      >
                        Try again
                      </button>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="input-glass h-8 min-w-44 py-1 text-xs"
                        value={aiLanguageCode}
                        onChange={(e) =>
                          setAiLanguageCode(
                            e.target.value as AiLyricsLanguageCode
                          )
                        }
                        disabled={aiGenerating}
                      >
                        {AI_LYRICS_LANGUAGE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => void generateAiLyricsForTrack()}
                        disabled={aiGenerating}
                      >
                        {aiGenerating ? (
                          <>
                            <Spinner
                              size="sm"
                              clockwise
                              className="text-current"
                            />
                            Generating...
                          </>
                        ) : (
                          "Generate AI lyrics"
                        )}
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground/60">
                      AI lyrics send audio to ElevenLabs for transcription. This
                      never runs automatically.
                    </p>
                    {aiError && (
                      <p className="mt-1 text-xs text-destructive">{aiError}</p>
                    )}
                  </div>
                )
              )}

              {(lyricsFile || fetchedLyrics || track.lyricsUrl) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => void openLyricsEditor()}
                  disabled={editorLoading}
                >
                  Open full-screen lyrics editor
                </Button>
              )}
            </div>
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept={COVER_ACCEPT}
            className="hidden"
            onChange={handleCoverInputChange}
          />
          <input
            ref={lyricsInputRef}
            type="file"
            accept={LYRICS_ACCEPT}
            className="hidden"
            onChange={handleLyricsInputChange}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!editTitle.trim() || !editArtist.trim() || saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LyricsEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        trackTitle={track.title}
        audioSrc={track.audioUrl}
        initialLyrics={editorLyrics}
        onApply={(nextLyrics) => {
          const file = new File(
            [new Blob([nextLyrics], { type: "text/plain" })],
            "lyrics.lrc",
            {
              type: "text/plain",
            }
          )
          setLyricsFile(file)
          setFetchedLyrics(null)
          setLyricsStatus("idle")
          setAiError(null)
        }}
      />

      {/* Add to playlist dialog */}
      {playlists && onAddToPlaylist && (
        <Dialog
          open={playlistOpen}
          onOpenChange={(o) => {
            if (!o) setPlaylistOpen(false)
          }}
        >
          <DialogContent
            showCloseButton={false}
            onClick={(e) => e.stopPropagation()}
          >
            <DialogHeader>
              <DialogTitle>Add to playlist</DialogTitle>
            </DialogHeader>
            <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {playlists.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No playlists yet.
                </p>
              ) : (
                playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={async (e) => {
                      e.stopPropagation()
                      await onAddToPlaylist(pl.id, track.id)
                      setPlaylistOpen(false)
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-foreground/8"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground/8">
                      <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {pl.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pl.trackCount} tracks
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPlaylistOpen(false)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete track?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${track.title}" will be permanently deleted and cannot be recovered.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteConfirm()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareTrackDialog
        trackId={track.id}
        trackTitle={track.title}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </div>
  )
}
