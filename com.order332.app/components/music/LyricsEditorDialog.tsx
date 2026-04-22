"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { FastForward, Pause, Play, Rewind, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AudioPlayerDuration,
  AudioPlayerProvider,
  AudioPlayerTime,
  AudioPlayerVolume,
  useAudioPlayer,
  useAudioPlayerTime,
} from "@/components/ui/audio-player"
import {
  ScrubBarContainer,
  ScrubBarProgress,
  ScrubBarThumb,
  ScrubBarTrack,
} from "@/components/ui/scrub-bar"
import {
  isLikelyLrc,
  offsetAll,
  offsetFromLine,
  offsetLineOnly,
  parseEditableLrc,
  seedTimedLinesFromText,
  toLrcText,
  type EditableLrcLine,
} from "@/lib/lrc-editor"

interface LyricsEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trackTitle: string
  audioSrc: string
  initialLyrics: string
  onApply: (nextLyrics: string) => void
}

const glassBg = {
  backdropFilter: "var(--glass-blur-sheet)",
  background: "var(--glass-bg-overlay)",
}

function parseForEditor(content: string): EditableLrcLine[] {
  if (isLikelyLrc(content)) {
    const parsed = parseEditableLrc(content)
    if (parsed.length > 0) return parsed
  }
  return seedTimedLinesFromText(content)
}

export function LyricsEditorDialog(props: LyricsEditorDialogProps) {
  const { open, onOpenChange } = props

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <DialogPrimitive.Popup
          className="fixed inset-0 z-50 m-auto flex overflow-hidden rounded-2xl ring-1 ring-white/15 transition-all duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          style={{
            width: "min(96vw, 1480px)",
            height: "min(94dvh, 980px)",
            ...glassBg,
          }}
        >
          <LyricsEditorDialogBody {...props} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function LyricsEditorDialogBody({
  open,
  onOpenChange,
  trackTitle,
  audioSrc,
  initialLyrics,
  onApply,
}: LyricsEditorDialogProps) {
  return (
    <AudioPlayerProvider>
      <LyricsEditorDialogInner
        open={open}
        onOpenChange={onOpenChange}
        trackTitle={trackTitle}
        audioSrc={audioSrc}
        initialLyrics={initialLyrics}
        onApply={onApply}
      />
    </AudioPlayerProvider>
  )
}

function LyricsEditorDialogInner({
  open,
  onOpenChange,
  trackTitle,
  audioSrc,
  initialLyrics,
  onApply,
}: LyricsEditorDialogProps) {
  const player = useAudioPlayer()
  const currentTime = useAudioPlayerTime()
  const { setActiveItem, seek, pause, play, isPlaying, duration } = player

  const [lines, setLines] = useState<EditableLrcLine[]>(() =>
    parseForEditor(initialLyrics)
  )
  const [baselineLines, setBaselineLines] = useState<EditableLrcLine[]>(() =>
    parseForEditor(initialLyrics)
  )
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [deltaMs, setDeltaMs] = useState("250")
  const [undoSnapshot, setUndoSnapshot] = useState<EditableLrcLine[] | null>(
    null
  )
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const next = parseForEditor(initialLyrics)
    setLines(next)
    setBaselineLines(next)
    setSelectedIndex(0)
    setUndoSnapshot(null)
  }, [initialLyrics, open])

  useEffect(() => {
    if (!open) {
      pause()
      void setActiveItem(null)
      return
    }

    if (!audioSrc) return
    void setActiveItem({
      id: `lyrics-editor-${audioSrc}`,
      src: audioSrc,
      data: { trackTitle },
    })
    seek(0)
    pause()
  }, [audioSrc, open, pause, seek, setActiveItem, trackTitle])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-line-index="${selectedIndex}"]`
    )
    el?.scrollIntoView({ block: "nearest" })
  }, [open, selectedIndex])

  const selectedLine = lines[selectedIndex] ?? null
  const parsedDelta = useMemo(
    () => Number.parseInt(deltaMs, 10) || 0,
    [deltaMs]
  )

  const saveUndo = () => setUndoSnapshot(lines.map((line) => ({ ...line })))

  const seekTo = useCallback(
    (sec: number) => {
      const safe = Math.max(0, sec)
      seek(safe)
    },
    [seek]
  )

  const onTogglePlay = useCallback(async () => {
    if (isPlaying) {
      pause()
      return
    }
    await play().catch(() => undefined)
  }, [isPlaying, pause, play])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " " && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        void onTogglePlay()
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        seekTo(Math.max(0, currentTime - 2))
        return
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        seekTo(currentTime + 2)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [currentTime, onTogglePlay, open, seekTo])

  const applyDeltaLineOnly = () => {
    if (!selectedLine) return
    saveUndo()
    setLines(offsetLineOnly(lines, selectedIndex, parsedDelta))
  }

  const applyDeltaFromLine = () => {
    if (!selectedLine) return
    saveUndo()
    setLines(offsetFromLine(lines, selectedIndex, parsedDelta))
  }

  const applyDeltaAll = () => {
    saveUndo()
    setLines(offsetAll(lines, parsedDelta))
  }

  const setSelectedToCurrentTime = () => {
    if (!selectedLine) return
    saveUndo()
    setLines((prev) =>
      prev.map((line, idx) =>
        idx === selectedIndex
          ? {
              ...line,
              timeMs: Math.max(0, Math.round(currentTime * 1000)),
            }
          : line
      )
    )
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <button
        onClick={() => onOpenChange(false)}
        className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-foreground/8 text-muted-foreground transition-colors hover:bg-foreground/15 hover:text-foreground"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="border-b border-foreground/10 px-5 py-3">
        <DialogPrimitive.Title className="truncate font-heading text-base font-medium text-foreground">
          Lyrics editor · {trackTitle}
        </DialogPrimitive.Title>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[400px_1fr]">
        <div className="min-h-0 border-r border-foreground/10 p-4">
          <div className="glass-card h-full min-h-0 rounded-2xl border border-white/10 p-4">
            <p className="mb-3 text-[11px] tracking-[0.2em] text-muted-foreground/70">
              PREVIEW PLAYER
            </p>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="truncate text-sm text-foreground/90">
                  {trackTitle}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => seekTo(Math.max(0, currentTime - 2))}
                  >
                    <Rewind className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 min-w-20"
                    onClick={() => void onTogglePlay()}
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {isPlaying ? "Pause" : "Play"}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => seekTo(currentTime + 2)}
                  >
                    <FastForward className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <ScrubBarContainer
                duration={duration ?? 0}
                value={currentTime}
                onScrub={(t) => seekTo(t)}
                className="flex-col items-stretch gap-0"
              >
                <ScrubBarTrack className="h-1.5 border-white/20 bg-white/10">
                  <ScrubBarProgress className="bg-white/75" />
                  <ScrubBarThumb className="h-3.5 w-3.5 bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.25)]" />
                </ScrubBarTrack>
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground/90 tabular-nums">
                  <AudioPlayerTime className="text-xs text-muted-foreground/90" />
                  <AudioPlayerDuration className="text-xs text-muted-foreground/90" />
                </div>
              </ScrubBarContainer>

              <div className="mt-2 border-t border-white/10 pt-2">
                <AudioPlayerVolume className="w-full" />
              </div>
            </div>

            <div className="mt-4 border-t border-foreground/10 pt-4">
              <p className="mb-2 text-[11px] tracking-[0.2em] text-muted-foreground/70">
                TIMING TOOLS
              </p>
              <label className="mb-1 block text-xs text-muted-foreground">
                Offset (ms)
              </label>
              <input
                className="input-glass mb-2 w-full"
                value={deltaMs}
                onChange={(e) => setDeltaMs(e.target.value)}
                placeholder="250 or -120"
              />
              <div className="mb-2 flex flex-wrap gap-1.5">
                {[-500, -250, 250, 500].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    className="rounded-full border border-foreground/15 bg-foreground/5 px-2 py-1 text-[11px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                    onClick={() => setDeltaMs(String(delta))}
                  >
                    {delta > 0 ? `+${delta}` : String(delta)} ms
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applyDeltaLineOnly}
                >
                  Offset this line only
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applyDeltaFromLine}
                >
                  Offset this + following
                </Button>
                <Button size="sm" variant="outline" onClick={applyDeltaAll}>
                  Offset all lines
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={setSelectedToCurrentTime}
                >
                  Set line to playhead
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => undoSnapshot && setLines(undoSnapshot)}
                  disabled={!undoSnapshot}
                >
                  Undo last change
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setLines(baselineLines)
                    setUndoSnapshot(null)
                  }}
                >
                  Reset to original
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground/60">
                Shortcuts: Space play/pause, Left/Right seek +/-2s.
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] tracking-[0.2em] text-muted-foreground/70">
              LYRICS TIMELINE
            </p>
            <p className="text-xs text-muted-foreground">
              Click timestamp to seek
            </p>
          </div>
          <div ref={listRef} className="space-y-2.5 pb-20">
            {lines.map((line, idx) => (
              <div
                key={`${idx}-${line.timeMs}`}
                data-line-index={idx}
                className={`rounded-xl border p-2.5 transition-colors ${idx === selectedIndex ? "border-foreground/35 bg-foreground/10" : "border-foreground/12 bg-foreground/3 hover:border-foreground/20"}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-foreground/15 bg-foreground/8 px-2 py-1 font-mono text-xs text-foreground hover:bg-foreground/12"
                    onClick={() => {
                      setSelectedIndex(idx)
                      seekTo(line.timeMs / 1000)
                    }}
                  >
                    {`${Math.floor(line.timeMs / 60000)
                      .toString()
                      .padStart(2, "0")}:${Math.floor(
                      (line.timeMs % 60000) / 1000
                    )
                      .toString()
                      .padStart(2, "0")}.${Math.floor((line.timeMs % 1000) / 10)
                      .toString()
                      .padStart(2, "0")}`}
                  </button>
                  <input
                    className="input-glass h-8 w-28 font-mono text-xs"
                    value={line.timeMs}
                    onFocus={() => setSelectedIndex(idx)}
                    onChange={(e) => {
                      const next = Math.max(
                        0,
                        Number.parseInt(e.target.value, 10) || 0
                      )
                      setLines((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, timeMs: next } : x
                        )
                      )
                    }}
                  />
                  <span className="text-[11px] text-muted-foreground">ms</span>
                </div>
                <input
                  className="input-glass w-full"
                  value={line.text}
                  onFocus={() => setSelectedIndex(idx)}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) =>
                        i === idx ? { ...x, text: e.target.value } : x
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-foreground/10 px-5 py-3">
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(toLrcText(lines))
              onOpenChange(false)
            }}
            disabled={lines.length === 0}
          >
            Apply edited lyrics
          </Button>
        </div>
      </div>
    </div>
  )
}
