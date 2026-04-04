"use client"

import { useMemo } from 'react'
import { useAudioPlayerTime } from '@/components/ui/audio-player'

export interface LrcLine {
  /** Timestamp in milliseconds. */
  timeMs: number
  text: string
}

/**
 * Parses an LRC file string into timed lines.
 *
 * Handles:
 * - Standard [mm:ss.xx] timestamps (centiseconds)
 * - [mm:ss.xxx] timestamps (milliseconds)
 * - [mm:ss:xx] (colon as centisecond separator)
 * - Multiple timestamps on one line: [00:12.00][00:35.00]Word → two lines
 * - Metadata tags ([ar:], [ti:], [al:], [by:], [offset:]) → skipped
 * - Empty/whitespace-only lines → included as { text: '' } for spacing
 */
export function parseLrc(content: string): LrcLine[] {
  const metadataTags = new Set(['ar', 'ti', 'al', 'by', 'offset', 'length', 're', 've'])
  const lines: LrcLine[] = []

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line) continue

    // Extract all [mm:ss.xx] or [mm:ss:xx] timestamp tags from the line
    const tagRegex = /\[(\d{1,2}):(\d{2})[.:](\d{2,3})\]/g
    const timestamps: number[] = []
    let lastTagEnd = 0
    let match: RegExpExecArray | null

    // Check if this is a metadata line like [ar:Artist]
    const metaMatch = /^\[([a-zA-Z]+):[^\]]*\]/.exec(line)
    if (metaMatch && metadataTags.has(metaMatch[1].toLowerCase())) continue

    while ((match = tagRegex.exec(line)) !== null) {
      const mm = parseInt(match[1], 10)
      const ss = parseInt(match[2], 10)
      const frac = match[3]
      // Normalise to milliseconds: 2-digit frac = centiseconds (*10), 3-digit = milliseconds
      const fracMs = frac.length === 3 ? parseInt(frac, 10) : parseInt(frac, 10) * 10
      timestamps.push(mm * 60_000 + ss * 1_000 + fracMs)
      lastTagEnd = match.index + match[0].length
    }

    if (timestamps.length === 0) continue

    const text = line.slice(lastTagEnd).trim()
    for (const timeMs of timestamps) {
      lines.push({ timeMs, text })
    }
  }

  // Sort by timestamp (multi-timestamp lines may be out of order)
  lines.sort((a, b) => a.timeMs - b.timeMs)
  return lines
}

/**
 * Returns the index of the currently active LRC line given playback time in seconds.
 * Returns -1 if before the first line.
 */
export function getActiveLrcLineIndex(lines: LrcLine[], currentTimeSec: number): number {
  const currentTimeMs = currentTimeSec * 1000
  let active = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= currentTimeMs) {
      active = i
    } else {
      break
    }
  }
  return active
}

/**
 * Hook that subscribes to AudioPlayerProvider time and returns the active LRC line index.
 * Must be used inside an AudioPlayerProvider.
 */
export function useLrcSync(lines: LrcLine[]): { activeIndex: number } {
  const currentTimeSec = useAudioPlayerTime()
  const activeIndex = useMemo(
    () => getActiveLrcLineIndex(lines, currentTimeSec),
    [lines, currentTimeSec],
  )
  return { activeIndex }
}
