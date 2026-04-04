"use client"

import { useEffect, useState } from "react"
import { ChevronDown, Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAudioPlayer, useAudioPlayerTime, AudioPlayerSpeed, AudioPlayerTime, AudioPlayerDuration } from "@/components/ui/audio-player"
import {
  ScrubBarContainer,
  ScrubBarProgress,
  ScrubBarThumb,
  ScrubBarTimeLabel,
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

  // Multiband volume for Matrix VU (16 columns)
  const MATRIX_COLS = 16
  const bandLevels = useMultibandVolume(stream, {
    bands: MATRIX_COLS,
    loPass: 40,
    hiPass: 300,
    analyserOptions: { fftSize: 2048, smoothingTimeConstant: 0.8 },
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

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        showCloseButton={false}
        className={cn(
          "flex flex-col overflow-hidden p-0",
          isMobile
            ? "h-[92dvh] rounded-t-2xl"
            : "w-full max-w-sm",
        )}
        style={{
          backdropFilter: "var(--glass-blur-sheet)",
          background: "var(--glass-bg-overlay)",
        }}
      >
        {/* Close handle (mobile) */}
        {isMobile && (
          <button
            onClick={onClose}
            className="mx-auto mt-3 flex h-5 w-full items-start justify-center"
          >
            <div className="h-1 w-10 rounded-full bg-foreground/20" />
          </button>
        )}

        {/* Desktop close button */}
        {!isMobile && (
          <button
            onClick={onClose}
            className="absolute left-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
          </button>
        )}

        <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-4">
          {/* Matrix VU visualizer */}
          <div className="mb-6 flex justify-center">
            <Matrix
              rows={7}
              cols={MATRIX_COLS}
              mode="vu"
              levels={bandLevels}
              size={10}
              gap={2}
              palette={{
                on: "oklch(0.9 0 0 / 90%)",
                off: "oklch(0.9 0 0 / 8%)",
              }}
              className="rounded-lg"
            />
          </div>

          {/* Cover art */}
          <div className="mx-auto mb-6 h-48 w-48 shrink-0 overflow-hidden rounded-2xl bg-foreground/5 shadow-lg">
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
            <h3 className="text-lg font-semibold tracking-wide text-foreground">
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
          <div className="mb-4 h-12 overflow-hidden">
            <BarVisualizer
              mediaStream={stream}
              state={player.isPlaying ? "speaking" : "listening"}
              barCount={20}
              minHeight={5}
              maxHeight={100}
              centerAlign
              className="h-full w-full"
            />
          </div>

          {/* Scrub bar */}
          <ScrubBarContainer
            duration={player.duration ?? 0}
            value={currentTime}
            onScrub={(t) => player.seek(t)}
          >
            <ScrubBarTrack className="mb-1">
              <ScrubBarProgress />
              <ScrubBarThumb />
            </ScrubBarTrack>
            <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
              <AudioPlayerTime />
              <AudioPlayerDuration />
            </div>
          </ScrubBarContainer>

          {/* Controls */}
          <div className="my-4 flex items-center justify-center gap-4">
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

          {/* Playback rate */}
          <div className="mb-6 flex justify-center">
            <AudioPlayerSpeed speeds={[0.5, 1, 1.25, 1.5, 2]} />
          </div>

          {/* Lyrics */}
          {lyricsContent && (
            <div className="rounded-xl bg-foreground/3 p-4">
              <p className="mb-3 text-xs tracking-widest text-muted-foreground">LYRICS</p>
              <LyricsDisplay lyricsContent={lyricsContent} lyricsType={lyricsType} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
