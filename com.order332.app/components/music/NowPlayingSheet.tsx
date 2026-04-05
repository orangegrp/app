"use client"

import { useEffect, useRef, useState } from "react"
import { Drawer as DrawerPrimitive } from "vaul"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { AlignLeft, ListMusic, Music2, Pause, Play, Repeat, Repeat1, Share2, Shuffle, SkipBack, SkipForward, X } from "lucide-react"
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
import { ShareTrackDialog } from "./ShareTrackDialog"
import { fetchTrackLyrics, type LoopMode, type LyricsType, type MusicTrackMeta } from "@/lib/music-api"
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

// ── Transport controls: scrubber + shuffle / prev / play / next / loop ───────
function TransportControls() {
  const { playNext, playPrev, shuffle, loop, toggleShuffle, setLoop } = useMusicContext()
  const player = useAudioPlayer()
  const nextLoop: LoopMode = loop === 'none' ? 'all' : loop === 'all' ? 'track' : 'none'
  const LoopIcon = loop === 'track' ? Repeat1 : Repeat
  return (
    <div>
      <NowPlayingScrubBar />
      <div className="my-3 flex items-center justify-center gap-3">
        <button
          onClick={toggleShuffle}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full glass-button glass-button-ghost",
            shuffle ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-label="Shuffle"
        >
          <Shuffle className="h-4 w-4" />
        </button>
        <button
          onClick={playPrev}
          className="flex h-10 w-10 items-center justify-center rounded-full glass-button glass-button-ghost text-muted-foreground hover:text-foreground"
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          onClick={() => player.isPlaying ? player.pause() : player.play()}
          className="flex h-14 w-14 items-center justify-center rounded-full glass-button glass-button-glass"
        >
          {player.isPlaying
            ? <Pause className="h-6 w-6 fill-current" />
            : <Play className="ml-0.5 h-6 w-6 fill-current" />}
        </button>
        <button
          onClick={playNext}
          className="flex h-10 w-10 items-center justify-center rounded-full glass-button glass-button-ghost text-muted-foreground hover:text-foreground"
        >
          <SkipForward className="h-5 w-5" />
        </button>
        <button
          onClick={() => setLoop(nextLoop)}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full glass-button glass-button-ghost",
            loop !== 'none' ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-label={`Loop: ${loop}`}
        >
          <LoopIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Queue panel content ─────────────────────────────────────────────────────
function QueuePanelContent() {
  const { upNext, tracks, removeFromQueue, clearQueue } = useMusicContext()
  const queueTracks = upNext
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is MusicTrackMeta => !!t)

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] tracking-[0.2em] text-muted-foreground/40">UP NEXT</p>
        {queueTracks.length > 0 && (
          <button
            onClick={clearQueue}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      {queueTracks.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground/60">Queue is empty</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {queueTracks.map((track, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-foreground/5 group/qi">
              <span className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground/40">{i + 1}</span>
              <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md bg-foreground/5">
                {track.coverUrl
                  ? <img src={track.coverUrl} alt="" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center"><Music2 className="h-3 w-3 text-muted-foreground/30" /></div>
                }
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{track.title}</p>
                <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
              </div>
              <button
                onClick={() => removeFromQueue(i)}
                className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover/qi:opacity-100 transition-opacity"
                aria-label="Remove from queue"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Settings row: volume + speed + cast + queue + lyrics + share ─────────────
interface SettingsRowProps {
  hasLyrics: boolean
  showLyrics: boolean
  onToggleLyrics: () => void
  showQueue: boolean
  onToggleQueue: () => void
  onShare: () => void
}
function SettingsRow({ hasLyrics, showLyrics, onToggleLyrics, showQueue, onToggleQueue, onShare }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-center gap-4">
      <AudioPlayerVolume className="w-28 shrink-0" />
      <AudioPlayerSpeed speeds={[0.5, 1, 1.25, 1.5, 2]} className="shrink-0 glass-button glass-button-ghost text-muted-foreground hover:text-foreground" />
      <RemotePlaybackButton />
      <button
        onClick={onShare}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full glass-button glass-button-ghost text-muted-foreground hover:text-foreground"
        aria-label="Share track"
      >
        <Share2 className="h-5 w-5" />
      </button>
      <button
        onClick={onToggleQueue}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          showQueue
            ? "bg-foreground text-background"
            : "glass-button glass-button-ghost text-muted-foreground hover:text-foreground",
        )}
        aria-label={showQueue ? "Hide queue" : "Show queue"}
      >
        <ListMusic className="h-5 w-5" />
      </button>
      {hasLyrics && (
        <button
          onClick={onToggleLyrics}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            !showQueue && showLyrics
              ? "bg-foreground text-background"
              : "glass-button glass-button-ghost text-muted-foreground hover:text-foreground",
          )}
          aria-label={showLyrics ? "Show artwork" : "Show lyrics"}
        >
          <AlignLeft className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}

// ── Desktop player controls: transport + settings + queue toggle ─────────────
interface PlayerControlsProps {
  onShare: () => void
  showQueue: boolean
  onToggleQueue: () => void
}
function PlayerControls({ onShare, showQueue, onToggleQueue }: PlayerControlsProps) {
  return (
    <div className="shrink-0 w-full">
      <TransportControls />
      <div className="flex items-center justify-center gap-3">
        <AudioPlayerVolume className="w-28 shrink-0" />
        <AudioPlayerSpeed speeds={[0.5, 1, 1.25, 1.5, 2]} className="shrink-0 glass-button glass-button-ghost text-muted-foreground hover:text-foreground" />
        <RemotePlaybackButton />
        <button
          onClick={onShare}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full glass-button glass-button-ghost text-muted-foreground hover:text-foreground"
          aria-label="Share track"
        >
          <Share2 className="h-5 w-5" />
        </button>
        <button
          onClick={onToggleQueue}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            showQueue
              ? "bg-foreground text-background"
              : "glass-button glass-button-ghost text-muted-foreground hover:text-foreground",
          )}
          aria-label={showQueue ? "Hide queue" : "Show queue"}
        >
          <ListMusic className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

// ── Scrolling title — marquees only when text overflows its container ────────
function ScrollingTitle({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [shouldScroll, setShouldScroll] = useState(false)
  const prevTextRef = useRef(text)

  if (prevTextRef.current !== text) {
    prevTextRef.current = text
    setShouldScroll(false)
  }

  useEffect(() => {
    const container = containerRef.current
    const textEl = textRef.current
    if (!container || !textEl) return
    setShouldScroll(textEl.offsetWidth > container.clientWidth)
  }, [text])

  return (
    <div ref={containerRef} className={cn("overflow-hidden whitespace-nowrap", className)}>
      {shouldScroll ? (
        <span className="inline-block animate-title-marquee">
          <span className="pr-14">{text}</span>
          <span aria-hidden className="pr-14">{text}</span>
        </span>
      ) : (
        <span ref={textRef}>{text}</span>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export function NowPlayingSheet({ open, onClose }: NowPlayingSheetProps) {
  const { currentTrack } = useMusicContext()
  const player = useAudioPlayer()
  const isMobile = useIsMobile()

  const [shareOpen, setShareOpen] = useState(false)
  const [lyricsContent, setLyricsContent] = useState<string | null>(null)
  const [lyricsType, setLyricsType] = useState<LyricsType>("txt")
  const [showQueue, setShowQueue] = useState(false)

  const [showLyrics, setShowLyrics] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("music:showLyrics") === "true"
  })

  const toggleLyrics = () =>
    setShowLyrics((v) => {
      const next = !v
      localStorage.setItem("music:showLyrics", String(next))
      if (next) setShowQueue(false) // switch from queue to lyrics
      return next
    })

  const toggleQueue = () => setShowQueue((v) => !v)

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

  // Active mobile panel: queue > lyrics > art
  const mobilePanel: 'queue' | 'lyrics' | 'art' =
    showQueue ? 'queue' : (showLyrics && hasLyrics) ? 'lyrics' : 'art'

  const shareDialog = (
    <ShareTrackDialog
      trackId={currentTrack.id}
      trackTitle={currentTrack.title}
      open={shareOpen}
      onOpenChange={setShareOpen}
    />
  )

  // ── MOBILE ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
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
            <div className="flex shrink-0 items-center px-4 pt-3 pb-1">
              <div className="mx-auto h-1 w-10 rounded-full bg-foreground/20" />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                {/* Art panel */}
                <div
                  className={cn(
                    "absolute inset-0 overflow-y-auto overscroll-y-contain scrollbar-hide transition-all duration-300 ease-in-out",
                    mobilePanel !== 'art'
                      ? "pointer-events-none -translate-y-4 opacity-0"
                      : "translate-y-0 opacity-100",
                  )}
                >
                  <div className="flex min-h-full flex-col justify-center px-5 py-4">
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
                    <div className="mt-5 mb-5 text-center">
                      <ScrollingTitle
                        text={currentTrack.title}
                        className="text-xl font-semibold tracking-wide text-foreground"
                      />
                      <p className="mt-0.5 text-sm text-muted-foreground truncate">{currentTrack.artist}</p>
                      {currentTrack.genre && (
                        <span className="mt-2 inline-block rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs text-muted-foreground">
                          {currentTrack.genre}
                        </span>
                      )}
                    </div>
                    <TransportControls />
                  </div>
                </div>

                {/* Lyrics panel */}
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col transition-all duration-300 ease-in-out",
                    mobilePanel !== 'lyrics'
                      ? "pointer-events-none translate-y-4 opacity-0"
                      : "translate-y-0 opacity-100",
                  )}
                >
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
                  <div
                    className="flex-1 overflow-y-auto overscroll-y-contain scrollbar-hide px-5 py-2"
                    style={{
                      maskImage: "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
                      WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
                    }}
                  >
                    {lyricsContent && (
                      <LyricsDisplay
                        lyricsContent={lyricsContent}
                        lyricsType={lyricsType}
                        onSeek={handleSeek}
                      />
                    )}
                  </div>
                  <div className="shrink-0 px-5 pt-1 pb-2">
                    <TransportControls />
                  </div>
                </div>

                {/* Queue panel */}
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col transition-all duration-300 ease-in-out",
                    mobilePanel !== 'queue'
                      ? "pointer-events-none translate-y-4 opacity-0"
                      : "translate-y-0 opacity-100",
                  )}
                >
                  <div
                    className="flex-1 overflow-y-auto overscroll-y-contain scrollbar-hide px-5 py-4"
                    style={{
                      maskImage: "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
                      WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
                    }}
                  >
                    <QueuePanelContent />
                  </div>
                  <div className="shrink-0 px-5 pt-1 pb-2">
                    <TransportControls />
                  </div>
                </div>
              </div>

              {/* Settings row */}
              <div className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
                <SettingsRow
                  hasLyrics={hasLyrics}
                  showLyrics={showLyrics}
                  onToggleLyrics={toggleLyrics}
                  showQueue={showQueue}
                  onToggleQueue={toggleQueue}
                  onShare={() => setShareOpen(true)}
                />
              </div>
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
      {shareDialog}
      </>
    )
  }

  // ── DESKTOP ────────────────────────────────────────────────────────────────
  return (
    <>
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0"
        />
        <DialogPrimitive.Popup
          className="fixed left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl transition-all duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0"
          style={{ width: "min(90vw, 1080px)", height: "82vh", ...glassBg }}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-foreground/8 text-muted-foreground transition-colors hover:bg-foreground/15 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex h-full w-full overflow-hidden">
            {/* Left: player */}
            <div
              className={cn(
                "flex w-[360px] shrink-0 flex-col items-center overflow-y-auto scrollbar-hide border-r border-foreground/8 px-10 py-8",
                showQueue ? "justify-start" : "justify-center",
              )}
            >
              <div className="flex flex-col items-center w-full">
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
                  <ScrollingTitle
                    text={currentTrack.title}
                    className="text-xl font-semibold tracking-wide text-foreground"
                  />
                  <p className="mt-1 text-sm text-muted-foreground">{currentTrack.artist}</p>
                  {currentTrack.genre && (
                    <span className="mt-1.5 inline-block rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs text-muted-foreground">
                      {currentTrack.genre}
                    </span>
                  )}
                </div>
                <PlayerControls
                  onShare={() => setShareOpen(true)}
                  showQueue={showQueue}
                  onToggleQueue={toggleQueue}
                />
              </div>

              {/* Desktop queue panel */}
              {showQueue && (
                <div className="w-full mt-6 border-t border-foreground/8 pt-5">
                  <QueuePanelContent />
                </div>
              )}
            </div>

            {/* Right: lyrics */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {hasLyrics ? (
                <div
                  className="flex-1 overflow-y-auto scrollbar-hide px-12 py-8"
                  style={{
                    maskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
                    WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
                  }}
                >
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
    {shareDialog}
    </>
  )
}
