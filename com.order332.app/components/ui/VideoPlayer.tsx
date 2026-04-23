"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react"
import Hls from "hls.js"
import type { FragLoadedData } from "hls.js"
import { cn } from "@/lib/utils"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  ScrubBarContainer,
  ScrubBarProgress,
  ScrubBarThumb,
  ScrubBarTimeLabel,
  ScrubBarTrack,
} from "@/components/ui/scrub-bar"
import { Spinner } from "./spinner"

interface VideoPlayerProps {
  /** HLS .m3u8 URL or a direct video URL. */
  src: string
  /** Thumbnail/poster image URL shown before playback. */
  poster?: string
  className?: string
  autoPlay?: boolean
  onEnded?: () => void
}

interface VideoNerdStats {
  resolution: string
  bufferedAheadSec: number
  transferKbps: number | null
  bandwidthEstimateKbps: number | null
  playbackRate: number
  volumePercent: number
  isMuted: boolean
  droppedFrames: number | null
  totalFrames: number | null
  hlsLevelLabel: string | null
}

export function VideoPlayer({
  src,
  poster,
  className,
  autoPlay = false,
  onEnded,
}: VideoPlayerProps) {
  const NETWORK_HISTORY_POINTS = 24
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transferBytesSinceSampleRef = useRef(0)
  const lastTransferSampleAtRef = useRef<number | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedProgress, setBufferedProgress] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [supportsVolumeControl, setSupportsVolumeControl] = useState(true)
  const [showStatsForNerds, setShowStatsForNerds] = useState(false)
  const [nerdStats, setNerdStats] = useState<VideoNerdStats | null>(null)
  const [networkHistory, setNetworkHistory] = useState<number[]>([])
  const prevVolumeRef = useRef(1)

  const updateNerdStats = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    let bufferedAheadSec = 0
    for (let i = 0; i < video.buffered.length; i += 1) {
      const start = video.buffered.start(i)
      const end = video.buffered.end(i)
      if (video.currentTime >= start && video.currentTime <= end) {
        bufferedAheadSec = Math.max(0, end - video.currentTime)
        break
      }
    }

    let droppedFrames: number | null = null
    let totalFrames: number | null = null
    if (typeof video.getVideoPlaybackQuality === "function") {
      const quality = video.getVideoPlaybackQuality()
      droppedFrames = Number.isFinite(quality.droppedVideoFrames)
        ? quality.droppedVideoFrames
        : null
      totalFrames = Number.isFinite(quality.totalVideoFrames)
        ? quality.totalVideoFrames
        : null
    } else {
      const webkitVideo = video as HTMLVideoElement & {
        webkitDroppedFrameCount?: number
        webkitDecodedFrameCount?: number
      }
      droppedFrames = Number.isFinite(webkitVideo.webkitDroppedFrameCount)
        ? (webkitVideo.webkitDroppedFrameCount ?? null)
        : null
      totalFrames = Number.isFinite(webkitVideo.webkitDecodedFrameCount)
        ? (webkitVideo.webkitDecodedFrameCount ?? null)
        : null
    }

    const now = Date.now()
    const lastSampleAt = lastTransferSampleAtRef.current
    const elapsedSec = lastSampleAt
      ? Math.max(0.25, (now - lastSampleAt) / 1000)
      : 1
    lastTransferSampleAtRef.current = now
    const transferredBytes = transferBytesSinceSampleRef.current
    transferBytesSinceSampleRef.current = 0

    const transferKbps =
      transferredBytes > 0
        ? Math.round((transferredBytes * 8) / 1000 / elapsedSec)
        : null

    const activeLevelIndex = hlsRef.current?.currentLevel ?? -1
    const level =
      activeLevelIndex >= 0 ? hlsRef.current?.levels?.[activeLevelIndex] : null
    const bandwidthEstimate = hlsRef.current?.bandwidthEstimate ?? 0
    const bandwidthEstimateKbps =
      Number.isFinite(bandwidthEstimate) && bandwidthEstimate > 0
        ? Math.round(bandwidthEstimate / 1000)
        : null
    const hlsLevelLabel = level
      ? `${level.width || "?"}x${level.height || "?"} · ${Math.round((level.bitrate ?? 0) / 1000)} kbps`
      : null

    const networkMetric =
      transferKbps ??
      bandwidthEstimateKbps ??
      Math.round(bufferedAheadSec * 300)
    setNetworkHistory((prev) =>
      [...prev, Math.max(1, networkMetric)].slice(-NETWORK_HISTORY_POINTS)
    )

    setNerdStats({
      resolution:
        video.videoWidth > 0 && video.videoHeight > 0
          ? `${video.videoWidth}x${video.videoHeight}`
          : "Unknown",
      bufferedAheadSec,
      transferKbps,
      bandwidthEstimateKbps,
      playbackRate: video.playbackRate,
      volumePercent: Math.round(video.volume * 100),
      isMuted: video.muted,
      droppedFrames,
      totalFrames,
      hlsLevelLabel,
    })
  }, [])

  useEffect(() => {
    const ua = navigator.userAgent
    const isSafari =
      /Safari/i.test(ua) &&
      !/Chrome|Chromium|CriOS|Edg|OPR|SamsungBrowser|Firefox/i.test(ua)
    const isIOSWebKit = /iP(ad|hone|od)/i.test(ua)

    const probe = document.createElement("video")
    try {
      const initial = probe.volume
      const next = initial > 0.9 ? 0.5 : 1
      probe.volume = next
      const canSetVolume = Math.abs(probe.volume - next) < 0.01
      setSupportsVolumeControl(canSetVolume && !isSafari && !isIOSWebKit)
    } catch {
      setSupportsVolumeControl(false)
    }
  }, [])

  // Initialise HLS.js
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false })
      hls.loadSource(src)
      hls.attachMedia(video)
      const onFragLoaded = (_event: string, data: FragLoadedData) => {
        const loaded = data.payload?.byteLength
        if (
          typeof loaded === "number" &&
          Number.isFinite(loaded) &&
          loaded > 0
        ) {
          transferBytesSinceSampleRef.current += loaded
        }
      }
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error("[VideoPlayer] HLS fatal error:", data)
        }
      })
      hls.on(Hls.Events.FRAG_LOADED, onFragLoaded)
      hlsRef.current = hls
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS — no WebKit-specific API usage, just set src
      video.src = src
    } else {
      // Direct video URL fallback
      video.src = src
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      transferBytesSinceSampleRef.current = 0
      lastTransferSampleAtRef.current = null
    }
  }, [src])

  useEffect(() => {
    if (!showStatsForNerds) return
    updateNerdStats()
    const timer = window.setInterval(updateNerdStats, 1000)
    return () => window.clearInterval(timer)
  }, [showStatsForNerds, updateNerdStats])

  useEffect(() => {
    setNetworkHistory([])
    transferBytesSinceSampleRef.current = 0
    lastTransferSampleAtRef.current = null
  }, [src])

  const networkPeak = useMemo(
    () => Math.max(1, ...networkHistory),
    [networkHistory]
  )
  const networkGraph = useMemo(() => {
    const points = networkHistory.length
      ? networkHistory
      : [1, 1, 1, 1, 1, 1, 1, 1]
    const width = 220
    const height = 60
    const stepX = points.length > 1 ? width / (points.length - 1) : width
    const coords = points.map((point, index) => {
      const x = index * stepX
      const ratio = Math.max(0, Math.min(1, point / networkPeak))
      const y = height - ratio * (height - 4) - 2
      return { x, y }
    })
    const linePath = coords.map(({ x, y }) => `${x},${y}`).join(" ")
    const areaPath = `${linePath} ${width},${height} 0,${height}`
    return { width, height, linePath, areaPath }
  }, [networkHistory, networkPeak])

  // Wire video events to state
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const updateBufferedProgress = () => {
      const currentDuration = video.duration || 0
      if (!currentDuration || video.buffered.length === 0) {
        setBufferedProgress(0)
        return
      }
      let bufferedEnd = 0
      for (let i = 0; i < video.buffered.length; i += 1) {
        const start = video.buffered.start(i)
        const end = video.buffered.end(i)
        if (video.currentTime >= start && video.currentTime <= end) {
          bufferedEnd = end
          break
        }
        if (end > bufferedEnd) bufferedEnd = end
      }
      setBufferedProgress(
        Math.max(0, Math.min(100, (bufferedEnd / currentDuration) * 100))
      )
    }
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      updateBufferedProgress()
    }
    const onDurationChange = () => {
      setDuration(video.duration || 0)
      updateBufferedProgress()
    }
    const onWaiting = () => setIsBuffering(true)
    const onCanPlay = () => {
      setIsBuffering(false)
      updateBufferedProgress()
    }
    const onProgress = () => updateBufferedProgress()
    const onVolumeChange = () => {
      setVolume(video.volume)
      setIsMuted(video.muted)
      if (video.volume > 0) {
        prevVolumeRef.current = video.volume
      }
    }
    const onEnded_ = () => {
      setIsPlaying(false)
      onEnded?.()
    }

    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("timeupdate", onTimeUpdate)
    video.addEventListener("durationchange", onDurationChange)
    video.addEventListener("progress", onProgress)
    video.addEventListener("waiting", onWaiting)
    video.addEventListener("canplay", onCanPlay)
    video.addEventListener("volumechange", onVolumeChange)
    video.addEventListener("ended", onEnded_)

    return () => {
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("timeupdate", onTimeUpdate)
      video.removeEventListener("durationchange", onDurationChange)
      video.removeEventListener("progress", onProgress)
      video.removeEventListener("waiting", onWaiting)
      video.removeEventListener("canplay", onCanPlay)
      video.removeEventListener("volumechange", onVolumeChange)
      video.removeEventListener("ended", onEnded_)
    }
  }, [onEnded])

  // Fullscreen change listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  // Auto-hide controls after 3s of inactivity
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying) setControlsVisible(false)
    }, 3000)
  }, [isPlaying])

  // Always show controls when paused
  useEffect(() => {
    if (!isPlaying) {
      setControlsVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [isPlaying])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(console.error)
    } else {
      video.pause()
    }
  }, [])

  const seek = useCallback((time: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = time
    setCurrentTime(time)
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.muted || video.volume === 0) {
      video.muted = false
      video.volume = prevVolumeRef.current > 0 ? prevVolumeRef.current : 0.8
      return
    }
    prevVolumeRef.current = video.volume
    video.muted = true
  }, [])

  const setVideoVolume = useCallback((nextVolume: number) => {
    const video = videoRef.current
    if (!video) return
    const clamped = Math.min(1, Math.max(0, nextVolume))
    video.volume = clamped
    video.muted = clamped === 0
  }, [])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(console.error)
    } else {
      document.exitFullscreen().catch(console.error)
    }
  }, [])

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block w-full"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          ref={containerRef}
          className={cn(
            "group relative overflow-hidden rounded-2xl bg-black",
            className
          )}
          onMouseMove={showControls}
          onMouseLeave={() => {
            if (isPlaying) setControlsVisible(false)
          }}
          onClick={togglePlay}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Video element — hidden native controls */}
          <video
            ref={videoRef}
            poster={poster}
            autoPlay={autoPlay}
            playsInline
            className="w-full"
            style={{ display: "block" }}
            crossOrigin="anonymous"
          />

          {/* Buffering indicator */}
          {isBuffering && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner size="md" clockwise className="text-white" />
            </div>
          )}

          {showStatsForNerds && nerdStats && (
            <div className="pointer-events-none absolute top-3 left-3 z-20 max-w-[min(92%,420px)] rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-[11px] text-white/90 backdrop-blur-md">
              <p className="mb-1 font-medium tracking-wider text-white/70 uppercase">
                Stats for nerds
              </p>
              <div className="mb-2">
                <div className="mb-1 flex items-center justify-between text-[10px] text-white/65">
                  <span>Network</span>
                  <span>
                    {nerdStats.transferKbps
                      ? `${nerdStats.transferKbps} kbps`
                      : nerdStats.bandwidthEstimateKbps
                        ? `~${nerdStats.bandwidthEstimateKbps} kbps`
                        : "estimating..."}
                  </span>
                </div>
                <div className="rounded-sm border border-white/12 bg-black/35 p-1">
                  <svg
                    viewBox={`0 0 ${networkGraph.width} ${networkGraph.height}`}
                    className="h-[44px] w-full"
                    preserveAspectRatio="none"
                    aria-label="Network transfer graph"
                  >
                    <defs>
                      <linearGradient
                        id="network-line-gradient"
                        x1="0"
                        y1="1"
                        x2="1"
                        y2="0"
                      >
                        <stop offset="0%" stopColor="rgba(248,113,113,0.95)" />
                        <stop offset="45%" stopColor="rgba(250,204,21,0.95)" />
                        <stop offset="100%" stopColor="rgba(74,222,128,0.95)" />
                      </linearGradient>
                      <linearGradient
                        id="network-area-gradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor="rgba(74,222,128,0.28)" />
                        <stop offset="40%" stopColor="rgba(250,204,21,0.16)" />
                        <stop
                          offset="100%"
                          stopColor="rgba(248,113,113,0.06)"
                        />
                      </linearGradient>
                    </defs>
                    <polyline
                      points={networkGraph.areaPath}
                      fill="url(#network-area-gradient)"
                      stroke="none"
                    />
                    <polyline
                      points={networkGraph.linePath}
                      fill="none"
                      stroke="url(#network-line-gradient)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
                <span className="text-white/65">Viewport</span>
                <span>{nerdStats.resolution}</span>
                <span className="text-white/65">Buffered</span>
                <span>{nerdStats.bufferedAheadSec.toFixed(1)}s ahead</span>
                <span className="text-white/65">Frames</span>
                <span>
                  {nerdStats.droppedFrames ?? "-"} dropped /{" "}
                  {nerdStats.totalFrames ?? "-"} total
                </span>
                <span className="text-white/65">Rate</span>
                <span>{nerdStats.playbackRate.toFixed(2)}x</span>
                <span className="text-white/65">Volume</span>
                <span>
                  {nerdStats.isMuted ? "Muted" : `${nerdStats.volumePercent}%`}
                </span>
                {nerdStats.hlsLevelLabel && (
                  <>
                    <span className="text-white/65">HLS level</span>
                    <span>{nerdStats.hlsLevelLabel}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Controls overlay */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 transition-opacity duration-300",
              controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Glass gradient fade */}
            <div
              className="absolute inset-0 rounded-b-2xl"
              style={{
                background:
                  "linear-gradient(to top, oklch(0 0 0 / 70%) 0%, transparent 100%)",
              }}
            />

            <div className="relative z-10 flex flex-col gap-2 px-4 pt-8 pb-4">
              {/* Scrub bar */}
              <ScrubBarContainer
                duration={duration}
                value={currentTime}
                onScrub={seek}
                className="gap-2"
              >
                <ScrubBarTrack>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-white/25"
                    style={{ width: `${bufferedProgress}%` }}
                  />
                  <ScrubBarProgress />
                  <ScrubBarThumb />
                </ScrubBarTrack>
                <ScrubBarTimeLabel time={currentTime} className="ml-2" />
              </ScrubBarContainer>

              {/* Controls row */}
              <div className="flex items-center gap-3">
                {/* Play/pause */}
                <button
                  onClick={togglePlay}
                  className="glass-button glass-button-ghost flex h-9 w-9 items-center justify-center rounded-full text-white/95 hover:text-white"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5 fill-current" />
                  ) : (
                    <Play className="h-5 w-5 fill-current" />
                  )}
                </button>

                {/* Mute toggle */}
                <button
                  onClick={toggleMute}
                  className="glass-button glass-button-ghost flex h-9 w-9 items-center justify-center rounded-full text-white/95 hover:text-white"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>

                {supportsVolumeControl && (
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(e) =>
                      setVideoVolume(Number.parseFloat(e.target.value))
                    }
                    className="video-volume-slider h-1 w-20"
                    style={{
                      ["--video-volume-progress" as string]: `${Math.round(
                        (isMuted ? 0 : volume) * 100
                      )}%`,
                    }}
                    aria-label="Volume"
                  />
                )}

                {/* Time */}
                <span className="text-xs text-white/80 tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <div className="flex-1" />

                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="glass-button glass-button-ghost flex h-9 w-9 items-center justify-center rounded-full text-white/95 hover:text-white"
                  aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? (
                    <Minimize className="h-4 w-4" />
                  ) : (
                    <Maximize className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem
            onClick={() => {
              setShowStatsForNerds((prev) => !prev)
            }}
          >
            {showStatsForNerds ? "Hide stats for nerds" : "Stats for nerds"}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}
