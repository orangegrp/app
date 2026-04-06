"use client"

import { useEffect, useRef } from "react"
import { useAudioPlayer, useAudioPlayerTime } from "@/components/ui/audio-player"
import { useMusicContext } from "./MusicContext"

/**
 * Syncs playback state with the browser's Media Session API so the OS
 * (lock screen, notification shade, hardware media keys, etc.) reflects
 * the current track and can control playback even when the app is in the
 * background.  Renders nothing — place inside AudioPlayerProvider + MusicProvider.
 */
export function MediaSessionSync() {
  const { currentTrack, playNext, playPrev } = useMusicContext()
  const player = useAudioPlayer()
  const currentTime = useAudioPlayerTime()

  // Stable refs so one-time handlers stay up-to-date without re-registering
  const playerRef = useRef(player)
  const playNextRef = useRef(playNext)
  const playPrevRef = useRef(playPrev)
  const currentTimeRef = useRef(currentTime)

  useEffect(() => { playerRef.current = player })
  useEffect(() => { playNextRef.current = playNext })
  useEffect(() => { playPrevRef.current = playPrev })
  useEffect(() => { currentTimeRef.current = currentTime })

  // ── Metadata ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    if (!currentTrack) {
      navigator.mediaSession.metadata = null
      return
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.genre ?? undefined,
      artwork: currentTrack.coverUrl
        ? [{ src: currentTrack.coverUrl, sizes: "512x512", type: "image/jpeg" }]
        : [],
    })
  }, [currentTrack])

  // ── Playback state ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.playbackState = player.isPlaying ? "playing" : "paused"
  }, [player.isPlaying])

  // ── Position state (1 Hz is plenty for the OS seekbar) ───────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    const id = setInterval(() => {
      const p = playerRef.current
      if (!p.duration || !Number.isFinite(p.duration)) return
      try {
        navigator.mediaSession.setPositionState({
          duration: p.duration,
          playbackRate: p.playbackRate,
          position: Math.min(currentTimeRef.current, p.duration),
        })
      } catch {
        /* Some environments throw for invalid state — ignore */
      }
    }, 1000)
    return () => clearInterval(id)
  }, []) // stable — reads via refs

  // ── Reset position state on track change to avoid stale scrubber ─────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    try {
      navigator.mediaSession.setPositionState({})
    } catch {
      /* ignore */
    }
  }, [currentTrack])

  // ── Action handlers (registered once) ────────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => playerRef.current.play()],
      ["pause", () => playerRef.current.pause()],
      ["previoustrack", () => playPrevRef.current()],
      ["nexttrack", () => playNextRef.current()],
      [
        "seekto",
        (d) => { if (d.seekTime != null) playerRef.current.seek(d.seekTime) },
      ],
      [
        "seekbackward",
        (d) => playerRef.current.seek(
          Math.max(0, currentTimeRef.current - (d.seekOffset ?? 10))
        ),
      ],
      [
        "seekforward",
        (d) => playerRef.current.seek(
          Math.min(
            playerRef.current.duration ?? Infinity,
            currentTimeRef.current + (d.seekOffset ?? 10)
          )
        ),
      ],
    ]

    for (const [action, handler] of handlers) {
      try { navigator.mediaSession.setActionHandler(action, handler) } catch { /* unsupported */ }
    }

    return () => {
      for (const [action] of handlers) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* ignore */ }
      }
    }
  }, []) // stable — reads via refs

  return null
}
