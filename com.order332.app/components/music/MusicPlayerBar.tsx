"use client"

import { Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  useAudioPlayer,
  useAudioPlayerTime,
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
import { useSidebarStore } from "@/lib/sidebar-store"

interface MusicPlayerBarProps {
  onOpenNowPlaying: () => void
}

export function MusicPlayerBar({ onOpenNowPlaying }: MusicPlayerBarProps) {
  const { currentTrack, playNext, playPrev } = useMusicContext()
  const player = useAudioPlayer()
  const currentTime = useAudioPlayerTime()
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed)

  if (!currentTrack) return null

  const barContent = (
    <div
      className="border-t border-foreground/8 px-4 py-2"
      style={{
        backdropFilter: "var(--glass-blur-sheet)",
        background: "var(--glass-bg-overlay)",
      }}
    >
      {/* Scrub bar */}
      <ScrubBarContainer
        duration={player.duration ?? 0}
        value={currentTime}
        onScrub={(t) => player.seek(t)}
      >
        <ScrubBarTrack className="mb-2 h-1">
          <ScrubBarProgress />
          <ScrubBarThumb className="h-3 w-3" />
        </ScrubBarTrack>
      </ScrubBarContainer>

      <div className="flex items-center gap-3">
        {/* Track info → tap to open now playing */}
        <button
          onClick={onOpenNowPlaying}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-foreground/5">
            {currentTrack.coverUrl ? (
              <img src={currentTrack.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music2 className="h-4 w-4 text-muted-foreground/40" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{currentTrack.title}</p>
            <p className="truncate text-xs text-muted-foreground">{currentTrack.artist}</p>
          </div>
        </button>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={playPrev}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Previous"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          <button
            onClick={() => (player.isPlaying ? player.pause() : player.play())}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background hover:opacity-80 transition-opacity"
            aria-label={player.isPlaying ? "Pause" : "Play"}
          >
            {player.isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            )}
          </button>

          <button
            onClick={playNext}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Next"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Time + volume (desktop only) */}
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
            <AudioPlayerTime />
            <span>/</span>
            <AudioPlayerDuration />
          </div>
          <AudioPlayerVolume className="w-28" />
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile bar — sits flush above MobileTabBar, accounting for safe-area-inset-bottom */}
      <div
        className="fixed inset-x-0 z-40 sm:hidden"
        style={{ bottom: 'calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        {barContent}
      </div>

      {/* Desktop bar — sits at bottom with sidebar offset */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 hidden sm:block",
          "transition-[padding-left] duration-200 ease-in-out",
          sidebarCollapsed ? "sm:pl-[60px]" : "sm:pl-56",
        )}
      >
        {barContent}
      </div>
    </>
  )
}
