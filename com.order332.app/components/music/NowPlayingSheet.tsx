"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, Music2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAudioPlayer, useAudioPlayerTime, AudioPlayerSpeed, AudioPlayerTime, AudioPlayerDuration } from "@/components/ui/audio-player"
import {
  ScrubBarContainer,
  ScrubBarProgress,
  ScrubBarThumb,
  ScrubBarTrack,
} from "@/components/ui/scrub-bar"
import { Matrix } from "@/components/ui/matrix"
import { BarVisualizer, useMultibandVolume } from "@/components/ui/bar-visualizer"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useMusicContext } from "./MusicContext"
import { LyricsDisplay } from "./LyricsDisplay"
import { fetchTrackLyrics, type LyricsType } from "@/lib/music-api"
import { useIsMobile } from "@/hooks/use-mobile"
import { useMediaElementAnalyser } from "@/hooks/useMediaElementAnalyser"

interface NowPlayingSheetProps {
  open: boolean
  onClose: () => void
}

export function NowPlayingSheet({ open, onClose }: NowPlayingSheetProps) {
  const { currentTrack, playNext, playPrev } = useMusicContext()
  const player = useAudioPlayer()
  const isMobile = useIsMobile()
  const currentTime = useAudioPlayerTime()

  // Media element analyser bridge
  const stream = useMediaElementAnalyser(player.ref, player.isPlaying)

  // Multiband volume for Matrix VU — cover bass through treble (bins 2–480)
  const MATRIX_COLS = 16
  const bandLevels = useMultibandVolume(stream, {
    bands: MATRIX_COLS,
    loPass: 2,
    hiPass: 480,
    analyserOptions: { fftSize: 2048, smoothingTimeConstant: 0.55 },
  })

  // Lyrics state
  const [lyricsContent, setLyricsContent] = useState<string | null>(null)
  const [lyricsType, setLyricsType] = useState<LyricsType>("txt")

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

  const VolumeSlider = () => (
    <div className="flex items-center gap-2">
      <button
        onClick={player.toggleMute}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={player.isMuted ? "Unmute" : "Mute"}
      >
        {player.isMuted || player.volume === 0
          ? <VolumeX className="h-4 w-4" />
          : <Volume2 className="h-4 w-4" />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.02}
        value={player.isMuted ? 0 : player.volume}
        onChange={(e) => player.setVolume(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-foreground/15 accent-foreground"
        aria-label="Volume"
      />
    </div>
  )

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        showCloseButton={false}
        className={cn(
          "flex flex-col overflow-hidden p-0",
          isMobile
            ? "h-[95dvh] rounded-t-2xl"
            : "w-96 max-w-[96vw]",
        )}
        style={{
          backdropFilter: "var(--glass-blur-sheet)",
          background: "var(--glass-bg-overlay)",
        }}
      >
        {/* Drag handle (mobile) */}
        {isMobile && (
          <button
            onClick={onClose}
            className="mx-auto mt-3 flex h-5 w-full shrink-0 items-start justify-center"
            aria-label="Close"
          >
            <div className="h-1 w-10 rounded-full bg-foreground/20" />
          </button>
        )}

        {/* Desktop close button */}
        {!isMobile && (
          <button
            onClick={onClose}
            className="absolute left-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-foreground/8 text-muted-foreground hover:bg-foreground/15 hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
          </button>
        )}

        <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3">

          {/* Matrix VU visualizer */}
          <div className="mb-4 flex justify-center">
            <Matrix
              rows={7}
              cols={MATRIX_COLS}
              mode="vu"
              levels={bandLevels}
              size={isMobile ? 9 : 10}
              gap={2}
              palette={{
                on: "oklch(0.9 0 0 / 85%)",
                off: "oklch(0.9 0 0 / 7%)",
              }}
              className="rounded-lg"
            />
          </div>

          {/* Cover art */}
          <div className={cn(
            "mx-auto mb-4 shrink-0 overflow-hidden rounded-2xl bg-foreground/5 shadow-xl",
            isMobile ? "h-44 w-44" : "h-52 w-52",
          )}>
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
          <div className="mb-3 text-center">
            <h3 className="text-base font-semibold tracking-wide text-foreground">
              {currentTrack.title}
            </h3>
            <p className="text-sm text-muted-foreground">{currentTrack.artist}</p>
            {currentTrack.genre && (
              <span className="mt-1 inline-block rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs text-muted-foreground">
                {currentTrack.genre}
              </span>
            )}
          </div>

          {/* Bar visualizer */}
          <div className="mb-3 h-10 overflow-hidden rounded-lg">
            <BarVisualizer
              mediaStream={stream}
              state={player.isPlaying ? "speaking" : "listening"}
              barCount={24}
              minHeight={5}
              maxHeight={100}
              centerAlign
              multibandOptions={{ loPass: 2, hiPass: 480, analyserOptions: { fftSize: 2048, smoothingTimeConstant: 0.55 } }}
              className="h-full w-full bg-transparent"
            />
          </div>

          {/* Scrub bar + time */}
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

          {/* Playback controls */}
          <div className="my-2 flex items-center justify-center gap-4">
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

          {/* Volume + speed row */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1">
              <VolumeSlider />
            </div>
            <AudioPlayerSpeed speeds={[0.5, 1, 1.25, 1.5, 2]} className="shrink-0" />
          </div>

          {/* Lyrics */}
          {lyricsContent && (
            <div className="rounded-xl bg-foreground/4 p-4">
              <p className="mb-3 text-xs tracking-widest text-muted-foreground/60">LYRICS</p>
              <LyricsDisplay lyricsContent={lyricsContent} lyricsType={lyricsType} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
