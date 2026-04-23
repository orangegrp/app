"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { AlignLeft, Languages, Music2, Pause, Play } from "lucide-react"
import {
  AudioPlayerProvider,
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
import { LyricsDisplay } from "@/components/music/LyricsDisplay"
import { FormattedGenre } from "@/components/music/FormattedGenre"
import { RemotePlaybackButton } from "@/components/music/RemotePlaybackButton"
import { hasRenderableGenre } from "@/lib/music-genre"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAuthStore } from "@/lib/auth-store"
import { cn } from "@/lib/utils"
import { isPWAContext } from "@/lib/pwa"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShareTrackData {
  id: string
  title: string
  artist: string
  genre: string | null
  durationSec: number
  audioUrl: string
  coverUrl: string | null
  lyricsUrl: string | null
  lyricsType: "lrc" | "txt" | null
  transliteratedLyricsUrl: string | null
  transliteratedLyricsType: "lrc" | "txt" | null
}

interface SharePageClientProps {
  token: string
  trackId: string
  initialTitle: string
  initialArtist: string
  initialGenre: string | null
  initialCoverUrl: string | null
  expiresAt: string | null
}

// Match NowPlayingSheet's glassBg style
const glassBg: React.CSSProperties = {
  backdropFilter: "var(--glass-blur-sheet)",
  background: "var(--glass-bg-overlay)",
}

// ── ScrollingTitle — identical to the one in NowPlayingSheet ──────────────────
function ScrollingTitle({
  text,
  className,
}: {
  text: string
  className?: string
}) {
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
    <div
      ref={containerRef}
      className={cn("overflow-hidden whitespace-nowrap", className)}
    >
      {shouldScroll ? (
        <span className="animate-title-marquee inline-block">
          <span className="pr-14">{text}</span>
          <span aria-hidden className="pr-14">
            {text}
          </span>
        </span>
      ) : (
        <span ref={textRef}>{text}</span>
      )}
    </div>
  )
}

// ── Scrub bar isolated at 60fps ───────────────────────────────────────────────
function ShareScrubBar() {
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
      <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
        <AudioPlayerTime />
        <AudioPlayerDuration />
      </div>
    </ScrubBarContainer>
  )
}

// ── Transport (scrub + prev/play/next) — single track, no prev/next ───────────
function TransportControls() {
  const player = useAudioPlayer()
  return (
    <div>
      <ShareScrubBar />
      <div className="my-3 flex items-center justify-center gap-4">
        <button
          onClick={() => (player.isPlaying ? player.pause() : player.play())}
          className="glass-button glass-button-glass flex h-14 w-14 items-center justify-center rounded-full"
        >
          {player.isPlaying ? (
            <Pause className="h-6 w-6 fill-current" />
          ) : (
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          )}
        </button>
      </div>
    </div>
  )
}

// ── Settings row: volume + speed + remote + lyrics toggle + sign-in CTA ───────
function SettingsRow({
  hasLyrics,
  showLyrics,
  onToggleLyrics,
  onSignIn,
}: {
  hasLyrics: boolean
  showLyrics: boolean
  onToggleLyrics: () => void
  onSignIn: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl p-2">
      {/* Controls row */}
      <div className="flex items-center justify-center gap-4">
        <AudioPlayerVolume className="w-28 shrink-0" />
        <AudioPlayerSpeed
          speeds={[0.5, 1, 1.25, 1.5, 2]}
          className="shrink-0"
        />
        <RemotePlaybackButton />
        {hasLyrics && (
          <button
            onClick={onToggleLyrics}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
              showLyrics
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label={showLyrics ? "Show artwork" : "Show lyrics"}
          >
            <AlignLeft className="h-5 w-5" />
          </button>
        )}
      </div>
      {/* Sign-in CTA */}
      <div className="mt-2 flex flex-col items-center gap-1">
        <p className="text-xs text-muted-foreground">
          Sign in for the full experience
        </p>
        <button
          onClick={onSignIn}
          className="glass-button glass-button-glass mb-2 shrink-0 rounded-lg px-3 py-1 text-xs tracking-widest"
        >
          SIGN IN
        </button>
      </div>
    </div>
  )
}

// ── Desktop player panel (left column) ───────────────────────────────────────
function DesktopPlayerPanel({
  track,
  isPlaying,
  onSignIn,
}: {
  track: ShareTrackData
  isPlaying: boolean
  onSignIn: () => void
}) {
  return (
    <div className="scrollbar-hide flex w-[360px] shrink-0 flex-col items-center justify-center overflow-y-auto border-r border-foreground/8 px-10 py-8">
      <div className="mb-6 h-60 w-60 shrink-0 overflow-hidden rounded-2xl bg-foreground/5 shadow-xl">
        {track.coverUrl ? (
          <Image
            src={track.coverUrl}
            alt={`${track.title} cover`}
            width={240}
            height={240}
            unoptimized
            className={cn(
              "h-full w-full object-cover transition-transform duration-1000",
              isPlaying && "scale-105"
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
          text={track.title}
          className="text-xl font-semibold tracking-wide text-foreground"
        />
        <p className="mt-1 text-sm text-muted-foreground">{track.artist}</p>
        {hasRenderableGenre(track.genre) && (
          <FormattedGenre genre={track.genre} className="mt-1.5" />
        )}
      </div>
      <div className="w-full">
        <TransportControls />
        <div className="mt-2 flex flex-col gap-3 px-2">
          <div className="flex items-center justify-center gap-3">
            <AudioPlayerVolume className="w-28 shrink-0" />
            <AudioPlayerSpeed
              speeds={[0.5, 1, 1.25, 1.5, 2]}
              className="shrink-0"
            />
            <RemotePlaybackButton />
          </div>
          <div className="mt-1 flex flex-col items-center justify-center gap-2">
            <p className="text-center text-xs text-muted-foreground">
              Sign in for the full experience
            </p>
            <button
              onClick={onSignIn}
              className="glass-button glass-button-glass shrink-0 rounded-lg px-3 py-1 text-xs tracking-widest"
            >
              SIGN IN
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main player (inside AudioPlayerProvider) ──────────────────────────────────
function SharePlayer({
  track,
  lyrics,
  lyricsType,
  onSignIn,
}: {
  track: ShareTrackData
  lyrics: string | null
  lyricsType: "lrc" | "txt"
  onSignIn: () => void
}) {
  const player = useAudioPlayer()
  const isMobile = useIsMobile()
  const hasLyrics = !!lyrics
  const [transliteratedLyrics, setTransliteratedLyrics] = useState<string | null>(
    null
  )
  const [showTransliteratedLyrics, setShowTransliteratedLyrics] =
    useState<boolean>(() => {
      if (typeof window === "undefined") return false
      return localStorage.getItem("music:showTransliteratedLyrics") === "true"
    })

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

  const toggleTransliteratedLyrics = () =>
    setShowTransliteratedLyrics((v) => {
      const next = !v
      localStorage.setItem("music:showTransliteratedLyrics", String(next))
      return next
    })

  const hasTransliteratedLyrics =
    !!track.transliteratedLyricsUrl && track.transliteratedLyricsType === "lrc"

  useEffect(() => {
    if (
      !showTransliteratedLyrics ||
      !hasTransliteratedLyrics ||
      transliteratedLyrics
    ) {
      return
    }
    fetch(track.transliteratedLyricsUrl as string)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((content) => setTransliteratedLyrics(content))
      .catch(() => {
        setShowTransliteratedLyrics(false)
        localStorage.setItem("music:showTransliteratedLyrics", "false")
      })
  }, [
    hasTransliteratedLyrics,
    showTransliteratedLyrics,
    track.transliteratedLyricsUrl,
    transliteratedLyrics,
  ])

  const handleSeek = (t: number) => player.seek(t)

  // Load track into the player once
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    player.setActiveItem({ id: track.id, src: track.audioUrl, data: track })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mobile layout ────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 flex flex-col overflow-hidden"
        style={glassBg}
      >
        {/* ── Art view ── */}
        {!(showLyrics && hasLyrics) && (
          <div className="flex min-h-0 flex-1 flex-col items-center px-5 pt-6 pb-2">
            {/* Cover art — flex-1 so it shrinks when screen is short */}
            <div className="flex min-h-0 w-full flex-1 items-center justify-center">
              <div className="aspect-square h-full max-h-[280px] max-w-full overflow-hidden rounded-2xl bg-foreground/5 shadow-xl">
                {track.coverUrl ? (
                  <Image
                    src={track.coverUrl}
                    alt={`${track.title} cover`}
                    width={280}
                    height={280}
                    unoptimized
                    className={cn(
                      "h-full w-full object-cover transition-transform duration-1000",
                      player.isPlaying && "scale-105"
                    )}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Music2 className="h-14 w-14 text-muted-foreground/20" />
                  </div>
                )}
              </div>
            </div>
            {/* Track info */}
            <div className="mt-4 w-full shrink-0 text-center">
              <ScrollingTitle
                text={track.title}
                className="text-xl font-semibold tracking-wide text-foreground"
              />
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {track.artist}
              </p>
              {hasRenderableGenre(track.genre) && (
                <FormattedGenre genre={track.genre} className="mt-2" />
              )}
            </div>
            {/* Transport controls */}
            <div className="mt-4 w-full shrink-0 pb-2">
              <TransportControls />
            </div>
          </div>
        )}

        {/* ── Lyrics view ── */}
        {showLyrics && hasLyrics && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-3 px-5 pt-4 pb-3">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-foreground/5">
                {track.coverUrl ? (
                  <Image
                    src={track.coverUrl}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Music2 className="h-4 w-4 text-muted-foreground/30" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {track.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {track.artist}
                </p>
              </div>
              {hasTransliteratedLyrics && (
                <button
                  onClick={toggleTransliteratedLyrics}
                  className={cn(
                    "glass-button glass-button-ghost ml-auto flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-xs",
                    showTransliteratedLyrics &&
                      "bg-white/10 !text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.95)] shadow-[0_0_18px_rgba(255,255,255,0.35)]"
                  )}
                  aria-label={
                    showTransliteratedLyrics
                      ? "Hide pronunciation lyrics"
                      : "Show pronunciation lyrics"
                  }
                >
                  <Languages className="h-3.5 w-3.5" />
                  Pronunciation
                </button>
              )}
            </div>
            <div
              className="scrollbar-hide min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-2"
              style={{
                maskImage:
                  "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
              }}
            >
              {lyrics && (
                <LyricsDisplay
                  lyricsContent={lyrics}
                  lyricsType={lyricsType}
                  transliteratedLyricsContent={
                    showTransliteratedLyrics ? transliteratedLyrics : null
                  }
                  transliteratedLyricsType={track.transliteratedLyricsType ?? "txt"}
                  onSeek={handleSeek}
                />
              )}
            </div>
            <div className="shrink-0 px-5 pt-1 pb-3">
              <TransportControls />
            </div>
          </div>
        )}

        {/* Settings row — always last, always below everything, cannot overlap */}
        <div className="shrink-0 px-5 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <SettingsRow
            hasLyrics={hasLyrics}
            showLyrics={showLyrics}
            onToggleLyrics={toggleLyrics}
            onSignIn={onSignIn}
          />
        </div>
      </div>
    )
  }

  // ── Desktop layout ───────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen items-stretch justify-center">
      <div className="flex h-full w-full overflow-hidden" style={glassBg}>
        <DesktopPlayerPanel
          track={track}
          isPlaying={player.isPlaying}
          onSignIn={onSignIn}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {hasLyrics ? (
            <div
              className="scrollbar-hide flex-1 overflow-y-auto px-12 py-8"
              style={{
                maskImage:
                  "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
              }}
            >
              <div className="mb-6 flex items-center justify-between gap-3">
                <p className="text-[10px] tracking-[0.2em] text-muted-foreground/40">
                  LYRICS
                </p>
                {hasTransliteratedLyrics && (
                  <button
                    onClick={toggleTransliteratedLyrics}
                    className={cn(
                      "glass-button glass-button-ghost flex h-8 items-center gap-1 rounded-full px-2 text-xs",
                      showTransliteratedLyrics &&
                        "bg-white/10 !text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.95)] shadow-[0_0_18px_rgba(255,255,255,0.35)]"
                    )}
                    aria-label={
                      showTransliteratedLyrics
                        ? "Hide pronunciation lyrics"
                        : "Show pronunciation lyrics"
                    }
                  >
                    <Languages className="h-3.5 w-3.5" />
                    Pronunciation
                  </button>
                )}
              </div>
              <LyricsDisplay
                lyricsContent={lyrics!}
                lyricsType={lyricsType}
                transliteratedLyricsContent={
                  showTransliteratedLyrics ? transliteratedLyrics : null
                }
                transliteratedLyricsType={track.transliteratedLyricsType ?? "txt"}
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
    </div>
  )
}

// ── Root client component ─────────────────────────────────────────────────────
export function SharePageClient({
  token,
  trackId,
  initialTitle,
  initialArtist,
  initialGenre,
  initialCoverUrl,
}: SharePageClientProps) {
  const router = useRouter()
  const [track, setTrack] = useState<ShareTrackData | null>(null)
  const [lyrics, setLyrics] = useState<string | null>(null)
  const [lyricsType, setLyricsType] = useState<"lrc" | "txt">("txt")
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  // On mount: silently check if the user is already logged in.
  // IMPORTANT: store the new access token in Zustand before navigating so the
  // dashboard layout finds it already set and skips its own refresh — preventing
  // the double-rotation bug that would log the user out.
  useEffect(() => {
    fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPwa: isPWAContext() }),
      credentials: "include",
    })
      .then(async (res) => {
        if (res.ok) {
          try {
            const { accessToken } = (await res.json()) as {
              accessToken: string
            }
            const [, b64] = accessToken.split(".")
            const payload = JSON.parse(
              atob(b64.replace(/-/g, "+").replace(/_/g, "/"))
            ) as { sub: string; permissions: string; isPwa: boolean }
            useAuthStore.getState().setAuth(accessToken, {
              id: payload.sub,
              permissions: payload.permissions,
              isPwa: payload.isPwa,
            })
          } catch {
            /* ignore JWT parse errors — still navigate */
          }
          router.replace(`/music?track=${encodeURIComponent(trackId)}`)
        } else {
          setChecking(false)
          loadTrack()
        }
      })
      .catch(() => {
        setChecking(false)
        loadTrack()
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadTrack = async () => {
    try {
      const res = await fetch(`/api/music/share/${encodeURIComponent(token)}`)
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? "Share link not found or expired")
        return
      }
      const data = (await res.json()) as { track: ShareTrackData }
      setTrack(data.track)

      // Fetch lyrics directly from the signed URL — no auth needed
      if (data.track.lyricsUrl && data.track.lyricsType) {
        fetch(data.track.lyricsUrl)
          .then((r) => (r.ok ? r.text() : Promise.reject()))
          .then((content) => {
            setLyrics(content)
            setLyricsType(data.track.lyricsType!)
          })
          .catch(() => {
            /* lyrics unavailable — non-fatal */
          })
      }
    } catch {
      setError("Failed to load track")
    }
  }

  const handleSignIn = () => {
    router.push(
      `/login?redirect=${encodeURIComponent(`/music?track=${trackId}`)}`
    )
  }

  if (checking) return null

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-card w-full max-w-sm rounded-2xl px-8 py-8 text-center">
          <Music2 className="mx-auto mb-4 h-10 w-10 text-muted-foreground/30" />
          <h1 className="text-lg font-semibold text-foreground">
            Link expired
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This share link is no longer valid.
          </p>
          <button
            onClick={handleSignIn}
            className="glass-button glass-button-glass mt-5 rounded-lg px-4 py-1.5 text-xs tracking-widest"
          >
            SIGN IN TO 332
          </button>
        </div>
      </div>
    )
  }

  // Loading skeleton — uses server-rendered data so there's no blank flash
  if (!track) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="glass-card w-full max-w-sm overflow-hidden rounded-2xl">
          <div className="relative aspect-square w-full animate-pulse bg-foreground/5">
            {initialCoverUrl ? (
              <Image
                src={initialCoverUrl}
                alt={`${initialTitle} album art`}
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music2 className="h-16 w-16 text-muted-foreground/20" />
              </div>
            )}
          </div>
          <div className="px-6 py-5 text-center">
            <p className="truncate text-xl font-semibold tracking-wide text-foreground">
              {initialTitle}
            </p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {initialArtist}
            </p>
            {initialGenre && (
              <span className="mt-2 inline-block rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs text-muted-foreground">
                {initialGenre}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <AudioPlayerProvider>
      <SharePlayer
        track={track}
        lyrics={lyrics}
        lyricsType={lyricsType}
        onSignIn={handleSignIn}
      />
    </AudioPlayerProvider>
  )
}
