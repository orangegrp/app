"use client"

import { useCallback, useEffect, useRef } from "react"
import { useAudioPlayer } from "@/components/ui/audio-player"
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

  const playerRef = useRef(player)
  const playNextRef = useRef(playNext)
  const playPrevRef = useRef(playPrev)

  useEffect(() => {
    playerRef.current = player
  })
  useEffect(() => {
    playNextRef.current = playNext
  })
  useEffect(() => {
    playPrevRef.current = playPrev
  })

  const updatePositionState = useCallback(() => {
    if (!("mediaSession" in navigator)) return
    const audio = playerRef.current.ref.current
    if (!audio) return

    const duration = audio.duration
    if (!Number.isFinite(duration) || duration <= 0) {
      try {
        navigator.mediaSession.setPositionState({})
      } catch {
        // Unsupported or invalid state in this environment
      }
      return
    }

    const rawPosition = Number.isFinite(audio.currentTime)
      ? audio.currentTime
      : 0
    const position = Math.min(Math.max(rawPosition, 0), duration)
    const rawRate = Number.isFinite(audio.playbackRate) ? audio.playbackRate : 1
    const playbackRate = rawRate > 0 ? rawRate : 1

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position,
      })
    } catch {
      // Unsupported or invalid state in this environment
    }
  }, [])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    if (!currentTrack) {
      navigator.mediaSession.metadata = null
      updatePositionState()
      return
    }

    const artwork: NonNullable<MediaMetadataInit["artwork"]> =
      currentTrack.coverUrl
        ? ["96x96", "128x128", "192x192", "256x256", "384x384", "512x512"].map(
            (sizes) => ({
              src: currentTrack.coverUrl as string,
              sizes,
              type: "image/jpeg",
            })
          )
        : []

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album ?? currentTrack.genre ?? undefined,
      artwork,
    })

    updatePositionState()
  }, [currentTrack, updatePositionState])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.playbackState = player.isPlaying
      ? "playing"
      : "paused"
  }, [player.isPlaying])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    const audio = playerRef.current.ref.current
    if (!audio) return

    const sync = () => updatePositionState()

    sync()
    audio.addEventListener("timeupdate", sync)
    audio.addEventListener("durationchange", sync)
    audio.addEventListener("ratechange", sync)
    audio.addEventListener("loadedmetadata", sync)
    audio.addEventListener("seeked", sync)
    audio.addEventListener("emptied", sync)

    const intervalId = window.setInterval(sync, 500)

    return () => {
      window.clearInterval(intervalId)
      audio.removeEventListener("timeupdate", sync)
      audio.removeEventListener("durationchange", sync)
      audio.removeEventListener("ratechange", sync)
      audio.removeEventListener("loadedmetadata", sync)
      audio.removeEventListener("seeked", sync)
      audio.removeEventListener("emptied", sync)
    }
  }, [player.ref, currentTrack?.id, updatePositionState])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => playerRef.current.play()],
      ["pause", () => playerRef.current.pause()],
      ["stop", () => playerRef.current.pause()],
      ["previoustrack", () => playPrevRef.current()],
      ["nexttrack", () => playNextRef.current()],
      [
        "seekto",
        (details) => {
          const audio = playerRef.current.ref.current
          if (!audio || details.seekTime == null) return
          const seekTime = Math.max(
            0,
            Math.min(details.seekTime, audio.duration || details.seekTime)
          )
          if (details.fastSeek && typeof audio.fastSeek === "function") {
            audio.fastSeek(seekTime)
          } else {
            playerRef.current.seek(seekTime)
          }
          updatePositionState()
        },
      ],
    ]

    const setHandlers = () => {
      for (const [action, handler] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, handler)
        } catch {
          // Action not supported in this browser
        }
      }
    }

    const clearHandlers = () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null)
        } catch {
          // Ignore unsupported cleanup failures
        }
      }
    }

    setHandlers()

    const audio = playerRef.current.ref.current
    const refreshHandlers = () => {
      setHandlers()
      updatePositionState()
    }

    if (audio) {
      // iOS is more reliable when actions are re-asserted after real playback starts.
      audio.addEventListener("play", refreshHandlers)
      audio.addEventListener("playing", refreshHandlers)
      audio.addEventListener("loadedmetadata", refreshHandlers)
    }

    return () => {
      if (audio) {
        audio.removeEventListener("play", refreshHandlers)
        audio.removeEventListener("playing", refreshHandlers)
        audio.removeEventListener("loadedmetadata", refreshHandlers)
      }
      clearHandlers()
    }
  }, [updatePositionState])

  return null
}
