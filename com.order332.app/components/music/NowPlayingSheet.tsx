"use client"

import { useEffect, useState } from "react"
import { Drawer as DrawerPrimitive } from "vaul"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { AlignLeft, Music2, Pause, Play, SkipBack, SkipForward, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  useAudioPlayer,
  useAudioPlayerTime,
  AudioPlayerSpeed,
  AudioPlayerTime,
  AudioPlayerDuration,
  AudioPlayerVolume,
} from "@/components/ui/audio-player"
import {
  ScrubBarContainer,
  ScrubBarProgress,
  ScrubBarThumb,
  ScrubBarTrack,
} from "@/components/ui/scrub-bar"
import { useMusicContext } from "./MusicContext"
import { LyricsDisplay } from "./LyricsDisplay"
import { RemotePlaybackButton } from "./RemotePlaybackButton"
import { fetchTrackLyrics, type LyricsType } from "@/lib/music-api"
import { useIsMobile } from "@/hooks/use-mobile"

interface NowPlayingSheetProps {
  open: boolean
  onClose: () => void
}

const glassBg = {
  backdropFilter: "var(--glass-blur-sheet)",
  background: "var(--glass-bg-overlay)",
}

// ── Isolated scrub bar ──────────────────────────────────────────────────────
// Lives at module scope so it is a stable component type.
// Only THIS component re-renders at 60 fps — nothing above it does.
function NowPlayingScrubBar() {
  const player = useAudioPlayer()
  const currentTime = useAudioPlayerTime()
  return (
    <ScrubBarContainer
      duration={player.duration ?? 0}
      value={currentTime}
      onScrub={(t) => player.seek(t)}
      className="mb-1 flex-col items-stretch gap-0"
    >
      <ScrubBarTrack className="h-1.5">
        <ScrubBarProgress />
        <ScrubBarThumb className="h-3.5 w-3.5" />
      </ScrubBarTrack>
      <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
        <AudioPlayerTime />
        <AudioPlayerDuration />
      </div>
    </ScrubBarContainer>
  )
}

// ── Transport controls: scrubber + prev / play / next ───────────────────────
// Module-scope → stable identity. Only NowPlayingScrubBar re-renders at 60 fps.
function TransportControls() {
  const { playNext, playPrev } = useMusicContext()
  const player = useAudioPlayer()
  return (
    <div>
      <NowPlayingScrubBar />
      <div className="my-3 flex items-center justify-center gap-4">
        <button
          onClick={playPrev}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          onClick={() => player.isPlaying ? player.pause() : player.play()}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg hover:opacity-80 transition-opacity"
        >
          {player.isPlaying
            ? <Pause className="h-6 w-6 fill-current" />
            : <Play className="ml-0.5 h-6 w-6 fill-current" />}
        </button>
        <button
          onClick={playNext}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
        >
          <SkipForward className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

// ── Settings row: volume + speed + cast + optional lyrics toggle ─────────────
// Centered layout — volume has a fixed width so the row doesn't stretch.
interface SettingsRowProps {
  hasLyrics: boolean
  showLyrics: boolean
  onToggleLyrics: () => void
}
function SettingsRow({ hasLyrics, showLyrics, onToggleLyrics }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-center gap-4">
      <AudioPlayerVolume className="w-28 shrink-0" />
      <AudioPlayerSpeed speeds={[0.5, 1, 1.25, 1.5, 2]} className="shrink-0" />
      <RemotePlaybackButton />
      {hasLyrics && (
        <button
          onClick={onToggleLyrics}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
            showLyrics
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-label={showLyrics ? "Show artwork" : "Show lyrics"}
        >
          <AlignLeft className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}

// ── Desktop player controls: transport + settings (no lyrics toggle) ─────────
function PlayerControls() {
  return (
    <div className="shrink-0">
      <TransportControls />
      <div className="flex items-center gap-3">
        <AudioPlayerVolume className="flex-1" />
        <AudioPlayerSpeed speeds={[0.5, 1, 1.25, 1.5, 2]} className="shrink-0" />
        <RemotePlaybackButton />
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
// Does NOT call useAudioPlayerTime() — so it only re-renders on real state
// changes (track change, lyrics load, open/close, showLyrics toggle).
export function NowPlayingSheet({ open, onClose }: NowPlayingSheetProps) {
  const { currentTrack } = useMusicContext()
  const player = useAudioPlayer()
  const isMobile = useIsMobile()

  const [lyricsContent, setLyricsContent] = useState<string | null>(null)
  const [lyricsType, setLyricsType] = useState<LyricsType>("txt")

  // Persist lyrics-view preference across songs and sessions
  const [showLyrics, setShowLyrics] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("music:showLyrics") === "true"
  })

  const toggleLyrics = () =>
    setShowLyrics((v) => {
      const next = !v
      localStorage.setItem("music:showLyrics", String(next))
      return next
    })

  useEffect(() => {
    if (!currentTrack?.lyricsUrl || !currentTrack.id) {
      setLyricsContent(null)
      return
    }
    fetchTrackLyrics(currentTrack.id)
      .then(({ content, type }) => {
        setLyricsContent(content)
        setLyricsType(type)
      })
      .catch(() => setLyricsContent(null))
  }, [currentTrack?.id, currentTrack?.lyricsUrl])

  if (!currentTrack) return null

  const hasLyrics = !!lyricsContent
  const handleSeek = (t: number) => player.seek(t)

  // ── MOBILE: full-screen vaul drawer with swipe-to-dismiss ──────────────────
  if (isMobile) {
    return (
      <DrawerPrimitive.Root
        open={open}
        onOpenChange={(o) => { if (!o) onClose() }}
        direction="bottom"
        shouldScaleBackground={false}
      >
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
          <DrawerPrimitive.Content
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl outline-none"
            style={{ height: "100dvh", ...glassBg }}
          >
            <DrawerPrimitive.Title className="sr-only">Now Playing</DrawerPrimitive.Title>
            {/* Drag handle — vaul attaches its touch listeners to the content root,
                so grabbing anywhere near the top also works, but the visible handle
                gives users an obvious affordance. */}
            <div className="flex shrink-0 items-center px-4 pt-3 pb-1">
              <div className="mx-auto h-1 w-10 rounded-full bg-foreground/20" />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              {/* Sliding panels — flex-1 absorbs all spare space */}
              <div className="relative min-h-0 flex-1">
                {/* Art panel */}
                <div
                  className={cn(
                    "absolute inset-0 overflow-y-auto scrollbar-hide transition-all duration-300 ease-in-out",
                    showLyrics && hasLyrics
                      ? "pointer-events-none -translate-y-4 opacity-0"
                      : "translate-y-0 opacity-100",
                  )}
                >
                  <div className="flex min-h-full flex-col justify-center px-5 py-4">
                    {/* Full-width album art — capped so it never crowds out controls */}
                    <div className="w-full max-h-[50vh] max-w-[50vh] mx-auto aspect-square shrink-0 overflow-hidden rounded-2xl bg-foreground/5 shadow-xl">
                      {currentTrack.coverUrl ? (
                        <img
                          src={currentTrack.coverUrl}
                          alt={`${currentTrack.title} cover`}
                          className={cn(
                            "h-full w-full object-cover transition-transform duration-1000",
                            player.isPlaying && "scale-105",
                          )}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Music2 className="h-14 w-14 text-muted-foreground/20" />
                        </div>
                      )}
                    </div>
                    {/* Track info */}
                    <div className="mt-5 mb-5 text-center">
                      <h3 className="text-xl font-semibold tracking-wide text-foreground truncate">
                        {currentTrack.title}
                      </h3>
                      <p className="mt-0.5 text-sm text-muted-foreground truncate">{currentTrack.artist}</p>
                      {currentTrack.genre && (
                        <span className="mt-2 inline-block rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs text-muted-foreground">
                          {currentTrack.genre}
                        </span>
                      )}
                    </div>
                    {/* Transport controls inline — keeps everything in one natural flow */}
                    <TransportControls />
                  </div>
                </div>

                {/* Lyrics panel */}
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col transition-all duration-300 ease-in-out",
                    !(showLyrics && hasLyrics)
                      ? "pointer-events-none translate-y-4 opacity-0"
                      : "translate-y-0 opacity-100",
                  )}
                >
                  {/* Sticky track info — never scrolls away */}
                  <div className="shrink-0 flex items-center gap-3 px-5 pt-2 pb-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-foreground/5">
                      {currentTrack.coverUrl ? (
                        <img src={currentTrack.coverUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Music2 className="h-4 w-4 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{currentTrack.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{currentTrack.artist}</p>
                    </div>
                  </div>
                  {/* Scrollable lyrics */}
                  <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
                    {lyricsContent && (
                      <LyricsDisplay
                        lyricsContent={lyricsContent}
                        lyricsType={lyricsType}
                        onSeek={handleSeek}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Settings row — pinned at the very bottom with safe-area inset */}
              <div className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
                <SettingsRow
                  hasLyrics={hasLyrics}
                  showLyrics={showLyrics}
                  onToggleLyrics={toggleLyrics}
                />
              </div>
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    )
  }

  // ── DESKTOP: centered base-ui dialog ───────────────────────────────────────
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogPrimitive.Portal>
        {/* Backdrop */}
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0"
        />

        <DialogPrimitive.Popup
          className="fixed left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl transition-all duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0"
          style={{ width: "min(90vw, 1080px)", height: "82vh", ...glassBg }}
        >
          <button
            onClick={onClose}
            className="absolute left-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-foreground/8 text-muted-foreground transition-colors hover:bg-foreground/15 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex h-full w-full overflow-hidden">
            {/* Left: player */}
            <div className="flex w-[360px] shrink-0 flex-col items-center justify-center overflow-y-auto scrollbar-hide border-r border-foreground/8 px-10 py-8">
              <div className="mb-6 h-60 w-60 shrink-0 overflow-hidden rounded-2xl bg-foreground/5 shadow-xl">
                {currentTrack.coverUrl ? (
                  <img
                    src={currentTrack.coverUrl}
                    alt={`${currentTrack.title} cover`}
                    className={cn(
                      "h-full w-full object-cover transition-transform duration-1000",
                      player.isPlaying && "scale-105",
                    )}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Music2 className="h-14 w-14 text-muted-foreground/20" />
                  </div>
                )}
              </div>
              <div className="mb-5 w-full text-center">
                <h3 className="text-xl font-semibold tracking-wide text-foreground">
                  {currentTrack.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{currentTrack.artist}</p>
                {currentTrack.genre && (
                  <span className="mt-1.5 inline-block rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs text-muted-foreground">
                    {currentTrack.genre}
                  </span>
                )}
              </div>
              <div className="w-full">
                <PlayerControls />
              </div>
            </div>

            {/* Right: lyrics */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {hasLyrics ? (
                <div className="flex-1 overflow-y-auto scrollbar-hide px-12 py-8">
                  <p className="mb-6 text-[10px] tracking-[0.2em] text-muted-foreground/40">
                    LYRICS
                  </p>
                  <LyricsDisplay
                    lyricsContent={lyricsContent!}
                    lyricsType={lyricsType}
                    onSeek={handleSeek}
                  />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground/40">
                  No lyrics available
                </div>
              )}
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
