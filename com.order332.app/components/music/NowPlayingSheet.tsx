"use client"

import { useEffect, useState } from "react"
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

export function NowPlayingSheet({ open, onClose }: NowPlayingSheetProps) {
  const { currentTrack, playNext, playPrev } = useMusicContext()
  const player = useAudioPlayer()
  const isMobile = useIsMobile()
  const currentTime = useAudioPlayerTime()

  const [lyricsContent, setLyricsContent] = useState<string | null>(null)
  const [lyricsType, setLyricsType] = useState<LyricsType>("txt")
  const [showLyrics, setShowLyrics] = useState(false)

  useEffect(() => {
    setShowLyrics(false)
  }, [currentTrack?.id])

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

  // ── Shared player controls ──────────────────────────────────────────────
  const PlayerControls = () => (
    <div className="shrink-0">
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

      <div className="flex items-center gap-3">
        <AudioPlayerVolume className="flex-1" />
        <AudioPlayerSpeed speeds={[0.5, 1, 1.25, 1.5, 2]} className="shrink-0" />
        {isMobile && hasLyrics && (
          <button
            onClick={() => setShowLyrics((v) => !v)}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
              showLyrics
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-label={showLyrics ? "Show artwork" : "Show lyrics"}
          >
            <AlignLeft className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )

  // ── Cover art block (reused in both layouts) ────────────────────────────
  const CoverArt = ({ size = "lg" }: { size?: "sm" | "lg" }) => (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-2xl bg-foreground/5 shadow-xl",
        size === "lg" ? "h-56 w-56" : "h-10 w-10 rounded-lg",
      )}
    >
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
          <Music2 className={size === "lg" ? "h-12 w-12 text-muted-foreground/20" : "h-4 w-4 text-muted-foreground/30"} />
        </div>
      )}
    </div>
  )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogPrimitive.Portal>
        {/* Backdrop */}
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0"
        />

        {/* ── MOBILE: full-height bottom sheet ── */}
        {isMobile && (
          <DialogPrimitive.Popup
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl transition-transform duration-300 data-starting-style:translate-y-full data-ending-style:translate-y-full"
            style={{ height: "95dvh", ...glassBg }}
          >
            {/* Drag handle */}
            <div className="flex shrink-0 items-center px-4 pt-3 pb-1">
              <button
                onClick={onClose}
                className="mx-auto flex h-5 items-start justify-center"
                aria-label="Close"
              >
                <div className="h-1 w-10 rounded-full bg-foreground/20" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              {/* Sliding panels area */}
              <div className="relative min-h-0 flex-1">
                {/* Art panel */}
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col items-center overflow-y-auto px-5 pt-2 pb-4 transition-all duration-300 ease-in-out",
                    showLyrics
                      ? "pointer-events-none -translate-y-4 opacity-0"
                      : "translate-y-0 opacity-100",
                  )}
                >
                  <div className="my-5 h-60 w-60 shrink-0 overflow-hidden rounded-2xl bg-foreground/5 shadow-xl">
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

                  <div className="mb-2 text-center">
                    <h3 className="text-lg font-semibold tracking-wide text-foreground">
                      {currentTrack.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{currentTrack.artist}</p>
                    {currentTrack.genre && (
                      <span className="mt-1.5 inline-block rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs text-muted-foreground">
                        {currentTrack.genre}
                      </span>
                    )}
                  </div>
                </div>

                {/* Lyrics panel */}
                <div
                  className={cn(
                    "absolute inset-0 overflow-y-auto px-5 pt-2 pb-4 transition-all duration-300 ease-in-out",
                    !showLyrics
                      ? "pointer-events-none translate-y-4 opacity-0"
                      : "translate-y-0 opacity-100",
                  )}
                >
                  {/* Mini track header */}
                  <div className="mb-4 flex items-center gap-3">
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
                  {lyricsContent && (
                    <LyricsDisplay
                      lyricsContent={lyricsContent}
                      lyricsType={lyricsType}
                      onSeek={handleSeek}
                    />
                  )}
                </div>
              </div>

              {/* Controls pinned at bottom */}
              <div className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
                <PlayerControls />
              </div>
            </div>
          </DialogPrimitive.Popup>
        )}

        {/* ── DESKTOP: centered dialog ── */}
        {!isMobile && (
          <DialogPrimitive.Popup
            className="fixed left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl transition-all duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0"
            style={{ width: "min(90vw, 1080px)", height: "82vh", ...glassBg }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute left-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-foreground/8 text-muted-foreground transition-colors hover:bg-foreground/15 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Two-column layout */}
            <div className="flex h-full w-full overflow-hidden">
              {/* Left: player panel */}
              <div className="flex w-[360px] shrink-0 flex-col items-center justify-center overflow-y-auto border-r border-foreground/8 px-10 py-8">
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

              {/* Right: lyrics panel */}
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {hasLyrics ? (
                  <div className="flex-1 overflow-y-auto px-12 py-8">
                    <p className="mb-6 text-[10px] tracking-[0.2em] text-muted-foreground/40">
                      LYRICS
                    </p>
                    <LyricsDisplay
                      lyricsContent={lyricsContent}
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
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
