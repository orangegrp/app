"use client"

import { useEffect, useState } from "react"
import { AlignLeft, ChevronDown, Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react"
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
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useMusicContext } from "./MusicContext"
import { LyricsDisplay } from "./LyricsDisplay"
import { fetchTrackLyrics, type LyricsType } from "@/lib/music-api"
import { useIsMobile } from "@/hooks/use-mobile"

interface NowPlayingSheetProps {
  open: boolean
  onClose: () => void
}

export function NowPlayingSheet({ open, onClose }: NowPlayingSheetProps) {
  const { currentTrack, playNext, playPrev } = useMusicContext()
  const player = useAudioPlayer()
  const isMobile = useIsMobile()
  const currentTime = useAudioPlayerTime()

  const [lyricsContent, setLyricsContent] = useState<string | null>(null)
  const [lyricsType, setLyricsType] = useState<LyricsType>("txt")
  // Mobile: toggle between art view and lyrics view
  const [showLyrics, setShowLyrics] = useState(false)

  useEffect(() => {
    // Reset lyrics view when track changes
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

  // Shared player controls block (scrubber + buttons + volume)
  const PlayerControls = () => (
    <div className="shrink-0">
      {/* Scrub bar */}
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

      {/* Play controls */}
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

      {/* Volume + speed + (mobile) lyrics toggle */}
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

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          "flex flex-col overflow-hidden rounded-t-2xl p-0",
          isMobile ? "h-[95dvh]" : "h-[88dvh]",
        )}
        style={{
          backdropFilter: "var(--glass-blur-sheet)",
          background: "var(--glass-bg-overlay)",
        }}
      >
        {/* Drag handle / close row */}
        <div className="flex shrink-0 items-center px-4 pt-3 pb-1">
          {/* Mobile: centred drag pill */}
          {isMobile && (
            <button
              onClick={onClose}
              className="mx-auto flex h-5 items-start justify-center"
              aria-label="Close"
            >
              <div className="h-1 w-10 rounded-full bg-foreground/20" />
            </button>
          )}
          {/* Desktop: close button left-aligned */}
          {!isMobile && (
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/8 text-muted-foreground hover:bg-foreground/15 hover:text-foreground transition-colors"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── DESKTOP LAYOUT: two columns ── */}
        {!isMobile && (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: player */}
            <div className="flex w-[380px] shrink-0 flex-col justify-center overflow-y-auto border-r border-foreground/8 px-10 py-6">
              {/* Cover art */}
              <div className="mx-auto mb-5 h-56 w-56 shrink-0 overflow-hidden rounded-2xl bg-foreground/5 shadow-xl">
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
                    <Music2 className="h-12 w-12 text-muted-foreground/20" />
                  </div>
                )}
              </div>

              {/* Track info */}
              <div className="mb-4 text-center">
                <h3 className="text-lg font-semibold tracking-wide text-foreground">{currentTrack.title}</h3>
                <p className="text-sm text-muted-foreground">{currentTrack.artist}</p>
                {currentTrack.genre && (
                  <span className="mt-1 inline-block rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs text-muted-foreground">
                    {currentTrack.genre}
                  </span>
                )}
              </div>

              <PlayerControls />
            </div>

            {/* Right: lyrics (or empty state) */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {hasLyrics ? (
                <div className="flex-1 overflow-y-auto px-10 py-6">
                  <p className="mb-4 text-xs tracking-widest text-muted-foreground/50">LYRICS</p>
                  <LyricsDisplay lyricsContent={lyricsContent} lyricsType={lyricsType} />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground/40">
                  No lyrics available
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MOBILE LAYOUT: single column with lyrics toggle ── */}
        {isMobile && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Scrollable area: art view OR lyrics view */}
            <div className="relative flex-1 overflow-hidden">

              {/* Art panel */}
              <div
                className={cn(
                  "absolute inset-0 flex flex-col items-center overflow-y-auto px-5 pt-2 transition-all duration-350 ease-in-out",
                  showLyrics ? "pointer-events-none opacity-0 -translate-y-3" : "opacity-100 translate-y-0",
                )}
              >
                {/* Cover art */}
                <div className="my-4 h-56 w-56 shrink-0 overflow-hidden rounded-2xl bg-foreground/5 shadow-xl">
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
                      <Music2 className="h-12 w-12 text-muted-foreground/20" />
                    </div>
                  )}
                </div>

                {/* Track info */}
                <div className="mb-2 text-center">
                  <h3 className="text-base font-semibold tracking-wide text-foreground">{currentTrack.title}</h3>
                  <p className="text-sm text-muted-foreground">{currentTrack.artist}</p>
                  {currentTrack.genre && (
                    <span className="mt-1 inline-block rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs text-muted-foreground">
                      {currentTrack.genre}
                    </span>
                  )}
                </div>
              </div>

              {/* Lyrics panel */}
              <div
                className={cn(
                  "absolute inset-0 overflow-y-auto px-5 pt-2 transition-all duration-350 ease-in-out",
                  !showLyrics ? "pointer-events-none opacity-0 translate-y-3" : "opacity-100 translate-y-0",
                )}
              >
                {/* Mini header when in lyrics view */}
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-foreground/5">
                    {currentTrack.coverUrl
                      ? <img src={currentTrack.coverUrl} alt="" className="h-full w-full object-cover" />
                      : <div className="flex h-full w-full items-center justify-center"><Music2 className="h-4 w-4 text-muted-foreground/30" /></div>}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{currentTrack.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{currentTrack.artist}</p>
                  </div>
                </div>
                {lyricsContent && (
                  <LyricsDisplay lyricsContent={lyricsContent} lyricsType={lyricsType} />
                )}
              </div>
            </div>

            {/* Controls pinned at bottom */}
            <div className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <PlayerControls />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
