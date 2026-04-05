"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Music2, Pause, Play } from "lucide-react"
import { AudioPlayerProvider, useAudioPlayer, useAudioPlayerTime, AudioPlayerTime, AudioPlayerDuration } from "@/components/ui/audio-player"
import { ScrubBarContainer, ScrubBarProgress, ScrubBarThumb, ScrubBarTrack } from "@/components/ui/scrub-bar"
import { cn } from "@/lib/utils"
import { isPWAContext } from "@/lib/pwa"

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
      <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
        <AudioPlayerTime />
        <AudioPlayerDuration />
      </div>
    </ScrubBarContainer>
  )
}

// ── Player controls (scrub + play/pause) ─────────────────────────────────────
function PlayerControls({ track }: { track: ShareTrackData }) {
  const player = useAudioPlayer()

  // Load track once on mount
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    player.setActiveItem({ id: track.id, src: track.audioUrl, data: track })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <ShareScrubBar />
      <div className="flex items-center justify-center mt-3">
        <button
          onClick={() => player.isPlaying ? player.pause() : player.play()}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg hover:opacity-80 transition-opacity"
        >
          {player.isPlaying
            ? <Pause className="h-6 w-6 fill-current" />
            : <Play className="ml-0.5 h-6 w-6 fill-current" />}
        </button>
      </div>
    </div>
  )
}

// ── Inner page (inside AudioPlayerProvider) ───────────────────────────────────
function SharePlayerInner({ track, onSignIn }: { track: ShareTrackData; onSignIn: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="glass-card w-full max-w-sm rounded-2xl overflow-hidden">
        {/* Cover art */}
        <div className="relative aspect-square w-full bg-foreground/5">
          {track.coverUrl ? (
            <img
              src={track.coverUrl}
              alt={`${track.title} album art`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music2 className="h-16 w-16 text-muted-foreground/20" />
            </div>
          )}
        </div>

        {/* Track info + controls */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-wide text-foreground truncate">
              {track.title}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground truncate">{track.artist}</p>
            {track.genre && (
              <span className="mt-2 inline-block rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs text-muted-foreground">
                {track.genre}
              </span>
            )}
          </div>

          <PlayerControls track={track} />

          <div className="border-t border-foreground/8 pt-4 flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground/60">
              Shared via <span className="text-muted-foreground">332</span>
            </p>
            <button
              onClick={onSignIn}
              className="glass-button glass-button-glass rounded-lg px-4 py-1.5 text-xs tracking-widest"
            >
              SIGN IN
            </button>
          </div>
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
  expiresAt,
}: SharePageClientProps) {
  const router = useRouter()
  const [track, setTrack] = useState<ShareTrackData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  // On mount: silently check if the user is already logged in
  useEffect(() => {
    fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPwa: isPWAContext() }),
      credentials: 'include',
    })
      .then((res) => {
        if (res.ok) {
          // User is logged in — redirect them to the track in the app
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
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? 'Share link not found or expired')
        return
      }
      const data = await res.json() as { track: ShareTrackData }
      setTrack(data.track)
    } catch {
      setError('Failed to load track')
    }
  }

  const handleSignIn = () => {
    router.push(`/login?redirect=${encodeURIComponent(`/music?track=${trackId}`)}`)
  }

  // While checking auth, show nothing (prevents flash)
  if (checking) {
    return null
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-card rounded-2xl px-8 py-8 text-center max-w-sm w-full">
          <Music2 className="mx-auto mb-4 h-10 w-10 text-muted-foreground/30" />
          <h1 className="text-lg font-semibold text-foreground">Link expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This share link is no longer valid.
          </p>
          <button
            onClick={handleSignIn}
            className="mt-5 glass-button glass-button-glass rounded-lg px-4 py-1.5 text-xs tracking-widest"
          >
            SIGN IN TO 332
          </button>
        </div>
      </div>
    )
  }

  if (!track) {
    // Loading state — show placeholder with server-rendered data
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="glass-card w-full max-w-sm rounded-2xl overflow-hidden">
          <div className={cn("relative aspect-square w-full bg-foreground/5", "animate-pulse")}>
            {initialCoverUrl ? (
              <img
                src={initialCoverUrl}
                alt={`${initialTitle} album art`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music2 className="h-16 w-16 text-muted-foreground/20" />
              </div>
            )}
          </div>
          <div className="px-6 py-5 text-center">
            <h1 className="text-xl font-semibold tracking-wide text-foreground truncate">{initialTitle}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground truncate">{initialArtist}</p>
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
      <SharePlayerInner track={track} onSignIn={handleSignIn} />
    </AudioPlayerProvider>
  )
}
