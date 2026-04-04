"use client"

import { useEffect, useRef, useState } from 'react'

/**
 * Bridges an HTMLAudioElement (from AudioPlayerProvider) to a MediaStream
 * that can be consumed by useAudioVolume() from bar-visualizer.tsx.
 *
 * Creates an AudioContext with:
 *   createMediaElementSource(audioElement) → analyser → createMediaStreamDestination
 *                                          ↘ context.destination (audio still plays)
 *
 * Notes:
 * - Only creates the AudioContext after isPlaying = true (requires a user gesture).
 * - Guards against calling createMediaElementSource() twice on the same element.
 * - The audio element must have crossOrigin="anonymous" for cross-origin URLs.
 *   AudioPlayerProvider already sets this.
 * - Returns null until the context is ready.
 */
export function useMediaElementAnalyser(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  isPlaying: boolean,
): MediaStream | null {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  // Guard: createMediaElementSource can only be called once per element
  const sourceCreatedRef = useRef(false)

  useEffect(() => {
    if (!isPlaying) return
    const audio = audioRef.current
    if (!audio) return
    if (sourceCreatedRef.current) return

    try {
      const ctx = new AudioContext()
      contextRef.current = ctx

      const source = ctx.createMediaElementSource(audio)
      sourceCreatedRef.current = true

      const destination = ctx.createMediaStreamDestination()

      // Connect: source → speakers AND source → stream destination
      source.connect(ctx.destination)
      source.connect(destination)

      setStream(destination.stream)
    } catch (err) {
      console.warn('[useMediaElementAnalyser] AudioContext setup error:', err)
    }

    return () => {
      // Do NOT close context on every unmount — it would break playback.
      // Context is closed only when the component tree is truly torn down.
    }
  }, [isPlaying, audioRef])

  // Close AudioContext only on full unmount of the host component
  useEffect(() => {
    return () => {
      contextRef.current?.close().catch(() => {})
    }
  }, [])

  return stream
}
