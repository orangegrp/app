"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CharacterAlignmentResponseModel } from "@elevenlabs/elevenlabs-js/api/types/CharacterAlignmentResponseModel"

// ── Types ──────────────────────────────────────────────────────────────────────

interface BaseSegment {
  segmentIndex: number
  text: string
  startTime: number
  endTime: number
}

export interface TranscriptWord extends BaseSegment {
  kind: "word"
}

interface GapSegment extends BaseSegment {
  kind: "gap"
}

export type TranscriptSegment = TranscriptWord | GapSegment

/**
 * Custom segment composer — receives the raw alignment model and returns
 * a fully composed segment array. When omitted, the default word/gap grouper is used.
 */
export type SegmentComposer = (
  alignment: CharacterAlignmentResponseModel
) => TranscriptSegment[]

export interface UseTranscriptViewerResult {
  audioRef: React.RefObject<HTMLAudioElement | null>
  segments: TranscriptSegment[]
  spokenSegments: TranscriptSegment[]
  currentWord: TranscriptWord | null
  unspokenSegments: TranscriptSegment[]
  currentTime: number
  duration: number
  isPlaying: boolean
  play: () => void
  pause: () => void
  seekToTime: (time: number) => void
  startScrubbing: () => void
  endScrubbing: () => void
}

interface UseTranscriptViewerOptions {
  alignment: CharacterAlignmentResponseModel
  hideAudioTags?: boolean
  segmentComposer?: SegmentComposer
  onPlay?: () => void
  onPause?: () => void
  onTimeUpdate?: () => void
  onEnded?: () => void
  onDurationChange?: () => void
}

// ── Default segment composer ───────────────────────────────────────────────────

/**
 * Groups character-level alignment data into word and gap segments.
 * Words are contiguous non-whitespace characters; gaps are runs of whitespace.
 */
function defaultSegmentComposer(
  alignment: CharacterAlignmentResponseModel
): TranscriptSegment[] {
  const { characters, characterStartTimesSeconds, characterEndTimesSeconds } =
    alignment
  const segments: TranscriptSegment[] = []
  let segmentIndex = 0
  let i = 0

  while (i < characters.length) {
    const isSpace =
      characters[i] === " " || characters[i] === "\n" || characters[i] === "\t"

    // Collect a run of same-kind characters
    const start = i
    while (
      i < characters.length &&
      ((isSpace &&
        (characters[i] === " " ||
          characters[i] === "\n" ||
          characters[i] === "\t")) ||
        (!isSpace &&
          characters[i] !== " " &&
          characters[i] !== "\n" &&
          characters[i] !== "\t"))
    ) {
      i++
    }

    const text = characters.slice(start, i).join("")
    const startTime = characterStartTimesSeconds[start] ?? 0
    const endTime = characterEndTimesSeconds[i - 1] ?? startTime

    if (isSpace) {
      segments.push({
        kind: "gap",
        segmentIndex: segmentIndex++,
        text,
        startTime,
        endTime,
      })
    } else {
      segments.push({
        kind: "word",
        segmentIndex: segmentIndex++,
        text,
        startTime,
        endTime,
      })
    }
  }

  return segments
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useTranscriptViewer({
  alignment,
  segmentComposer,
  onPlay,
  onPause,
  onTimeUpdate,
  onEnded,
  onDurationChange,
}: UseTranscriptViewerOptions): UseTranscriptViewerResult {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const wasPlayingRef = useRef(false)

  // Build segments from alignment
  const segments = useMemo(() => {
    const composer = segmentComposer ?? defaultSegmentComposer
    return composer(alignment)
  }, [alignment, segmentComposer])

  // Wire audio element events
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () => {
      setIsPlaying(true)
      onPlay?.()
    }
    const handlePause = () => {
      setIsPlaying(false)
      onPause?.()
    }
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      onTimeUpdate?.()
    }
    const handleDurationChange = () => {
      setDuration(audio.duration || 0)
      onDurationChange?.()
    }
    const handleEnded = () => {
      setIsPlaying(false)
      onEnded?.()
    }

    audio.addEventListener("play", handlePlay)
    audio.addEventListener("pause", handlePause)
    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("durationchange", handleDurationChange)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("play", handlePlay)
      audio.removeEventListener("pause", handlePause)
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("durationchange", handleDurationChange)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [onPlay, onPause, onTimeUpdate, onDurationChange, onEnded])

  // Derive spoken/current/unspoken from current time
  const { spokenSegments, currentWord, unspokenSegments } = useMemo(() => {
    const spoken: TranscriptSegment[] = []
    let current: TranscriptWord | null = null
    const unspoken: TranscriptSegment[] = []

    for (const segment of segments) {
      if (segment.endTime <= currentTime) {
        spoken.push(segment)
      } else if (segment.startTime <= currentTime && segment.kind === "word") {
        current = segment
      } else {
        unspoken.push(segment)
      }
    }

    return {
      spokenSegments: spoken,
      currentWord: current,
      unspokenSegments: unspoken,
    }
  }, [segments, currentTime])

  const play = useCallback(() => {
    audioRef.current?.play().catch(console.error)
  }, [])

  const pause = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  const seekToTime = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = time
    setCurrentTime(time)
  }, [])

  const startScrubbing = useCallback(() => {
    wasPlayingRef.current = !(audioRef.current?.paused ?? true)
    audioRef.current?.pause()
  }, [])

  const endScrubbing = useCallback(() => {
    if (wasPlayingRef.current) {
      audioRef.current?.play().catch(console.error)
    }
  }, [])

  return {
    audioRef,
    segments,
    spokenSegments,
    currentWord,
    unspokenSegments,
    currentTime,
    duration,
    isPlaying,
    play,
    pause,
    seekToTime,
    startScrubbing,
    endScrubbing,
  }
}
