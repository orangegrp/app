"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Airplay,
  Cast,
  Check,
  Download,
  Maximize,
  Minimize,
  Pause,
  Play,
  Settings,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  title?: string
  className?: string
  autoPlay?: boolean
  onEnded?: () => void
  onDownload?: () => void
}

interface VideoNerdStats {
  resolution: string
  bufferedAheadSec: number
  transferKbps: number | null
  bandwidthEstimateKbps: number | null
  muxPlaybackId: string | null
  sourceHost: string | null
  sourcePath: string | null
  readyState: number
  networkState: number
  bufferedRanges: number
  seekableRanges: number
  hlsLevelCount: number
  hlsCurrentLevel: number | null
  hlsLoadLevel: number | null
  hlsNextAutoLevel: number | null
  hlsLatencySec: number | null
  hlsDrift: number | null
  hlsCodecs: string | null
  playbackRate: number
  volumePercent: number
  isMuted: boolean
  droppedFrames: number | null
  totalFrames: number | null
  hlsLevelLabel: string | null
}

type IOSVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
  webkitDisplayingFullscreen?: boolean
}

type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

type WebKitAirPlayVideoElement = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void
}

interface QualityOption {
  value: number
  label: string
}

const PANIC_TINTS = [
  {
    line: "#00ff00",
    trackBg: "rgba(0, 255, 0, 0.28)",
    bufferBg: "rgba(0, 255, 0, 0.58)",
    thumbGlow: "rgba(0,255,0,0.85)",
  },
  {
    line: "#00ff66",
    trackBg: "rgba(0, 255, 102, 0.28)",
    bufferBg: "rgba(0, 255, 102, 0.58)",
    thumbGlow: "rgba(0,255,102,0.85)",
  },
  {
    line: "#00ffaa",
    trackBg: "rgba(0, 255, 170, 0.28)",
    bufferBg: "rgba(0, 255, 170, 0.58)",
    thumbGlow: "rgba(0,255,170,0.85)",
  },
  {
    line: "#00ffd5",
    trackBg: "rgba(0, 255, 213, 0.28)",
    bufferBg: "rgba(0, 255, 213, 0.58)",
    thumbGlow: "rgba(0,255,213,0.85)",
  },
] as const

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

export function VideoPlayer({
  src,
  poster,
  title,
  className,
  autoPlay = false,
  onEnded,
  onDownload,
}: VideoPlayerProps) {
  const NETWORK_HISTORY_POINTS = 120
  const NETWORK_SAMPLE_MS = 250
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transferBytesSinceSampleRef = useRef(0)
  const lastTransferSampleAtRef = useRef<number | null>(null)
  const lastMeasuredTransferKbpsRef = useRef<number | null>(null)
  const statsCardRef = useRef<HTMLDivElement>(null)
  const statsDragPointerIdRef = useRef<number | null>(null)
  const statsDragOffsetRef = useRef({ x: 0, y: 0 })

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
  const [statsPosition, setStatsPosition] = useState({ x: 12, y: 12 })
  const [playbackRate, setPlaybackRate] = useState(1)
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([])
  const [selectedQuality, setSelectedQuality] = useState(-1)
  const [remotePlaybackAvailable, setRemotePlaybackAvailable] = useState(false)
  const [isAppleDevice, setIsAppleDevice] = useState(false)
  const [panicMode, setPanicMode] = useState(false)
  const [panicTintIndex, setPanicTintIndex] = useState(0)
  const [nerdStats, setNerdStats] = useState<VideoNerdStats | null>(null)
  const [networkHistory, setNetworkHistory] = useState<number[]>([])
  const prevVolumeRef = useRef(1)
  const keySequenceRef = useRef("")
  const lastKeyAtRef = useRef<number | null>(null)

  const addTransferBytes = useCallback((bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return
    transferBytesSinceSampleRef.current += bytes
  }, [])

  const deriveQualityOptions = useCallback((hls: Hls): QualityOption[] => {
    const mapped = hls.levels.map((level, index) => {
      const height = level.height || 0
      const width = level.width || 0
      const bitrateKbps = Math.max(1, Math.round((level.bitrate ?? 0) / 1000))
      const resolutionLabel =
        width > 0 && height > 0 ? `${height}p (${width}x${height})` : `Level ${index + 1}`
      return {
        value: index,
        label: `${resolutionLabel} · ${bitrateKbps} kbps`,
      }
    })

    const uniqueByLabel = new Map<string, QualityOption>()
    for (const option of mapped) {
      if (!uniqueByLabel.has(option.label)) {
        uniqueByLabel.set(option.label, option)
      }
    }

    return [
      { value: -1, label: "Auto" },
      ...Array.from(uniqueByLabel.values()).sort((a, b) => b.value - a.value),
    ]
  }, [])

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
    if (transferKbps !== null) {
      lastMeasuredTransferKbpsRef.current = transferKbps
    }

    const activeLevelIndex = hlsRef.current?.currentLevel ?? -1
    const level =
      activeLevelIndex >= 0 ? hlsRef.current?.levels?.[activeLevelIndex] : null
    const hlsInstance = hlsRef.current
    const bandwidthEstimate = hlsRef.current?.bandwidthEstimate ?? 0
    const bandwidthEstimateKbps =
      Number.isFinite(bandwidthEstimate) && bandwidthEstimate > 0
        ? Math.round(bandwidthEstimate / 1000)
        : null
    const hlsLevelLabel = level
      ? `${level.width || "?"}x${level.height || "?"} · ${Math.round((level.bitrate ?? 0) / 1000)} kbps`
      : null

    const sourceUrl = video.currentSrc || src
    let sourceHost: string | null = null
    let sourcePath: string | null = null
    let muxPlaybackId: string | null = null
    try {
      const parsed = new URL(sourceUrl)
      sourceHost = parsed.host
      sourcePath = parsed.pathname
      const muxMatch = parsed.pathname.match(/\/([A-Za-z0-9_-]{8,})\.m3u8$/)
      muxPlaybackId = muxMatch?.[1] ?? null
    } catch {
      sourceHost = null
      sourcePath = null
      muxPlaybackId = null
    }

    const codecs = level
      ? [level.videoCodec, level.audioCodec].filter(Boolean).join(" | ")
      : null

    const networkMetric =
      transferKbps ??
      lastMeasuredTransferKbpsRef.current ??
      bandwidthEstimateKbps ??
      1
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
      muxPlaybackId,
      sourceHost,
      sourcePath,
      readyState: video.readyState,
      networkState: video.networkState,
      bufferedRanges: video.buffered.length,
      seekableRanges: video.seekable.length,
      hlsLevelCount: hlsInstance?.levels.length ?? 0,
      hlsCurrentLevel: hlsInstance
        ? hlsInstance.currentLevel >= 0
          ? hlsInstance.currentLevel
          : null
        : null,
      hlsLoadLevel: hlsInstance
        ? hlsInstance.loadLevel >= 0
          ? hlsInstance.loadLevel
          : null
        : null,
      hlsNextAutoLevel: hlsInstance
        ? hlsInstance.nextAutoLevel >= 0
          ? hlsInstance.nextAutoLevel
          : null
        : null,
      hlsLatencySec:
        typeof hlsInstance?.latency === "number"
          ? Number(hlsInstance.latency.toFixed(2))
          : null,
      hlsDrift:
        typeof hlsInstance?.drift === "number"
          ? Number(hlsInstance.drift.toFixed(3))
          : null,
      hlsCodecs: codecs || null,
      playbackRate: video.playbackRate,
      volumePercent: Math.round(video.volume * 100),
      isMuted: video.muted,
      droppedFrames,
      totalFrames,
      hlsLevelLabel,
    })
  }, [NETWORK_HISTORY_POINTS, src])

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

  useEffect(() => {
    setIsAppleDevice(/Apple/i.test(navigator.vendor || ""))
    const video = videoRef.current as WebKitAirPlayVideoElement | null
    if (!video) {
      setRemotePlaybackAvailable(false)
      return
    }

    if (typeof video.webkitShowPlaybackTargetPicker === "function") {
      setRemotePlaybackAvailable(true)
      return
    }

    if (!("remote" in video)) {
      setRemotePlaybackAvailable(false)
      return
    }

    const remote = video.remote
    let watchId: number | undefined
    setRemotePlaybackAvailable(true)
    remote
      .watchAvailability((available) => {
        if (available) setRemotePlaybackAvailable(true)
      })
      .then((id) => {
        watchId = id
      })
      .catch(() => {
        setRemotePlaybackAvailable(true)
      })

    return () => {
      if (watchId != null) {
        remote.cancelWatchAvailability(watchId).catch(() => {})
      }
    }
  }, [src])

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
          addTransferBytes(loaded)
        }
      }
      const onManifestParsed = () => {
        setQualityOptions(deriveQualityOptions(hls))
        setSelectedQuality(hls.autoLevelEnabled ? -1 : hls.loadLevel)
      }
      const onLevelSwitched = () => {
        const desired = hls.autoLevelEnabled ? -1 : hls.loadLevel
        setSelectedQuality(desired >= 0 ? desired : -1)
      }
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error("[VideoPlayer] HLS fatal error:", data)
        }
      })
      hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed)
      hls.on(Hls.Events.FRAG_LOADED, onFragLoaded)
      hls.on(Hls.Events.LEVEL_SWITCHED, onLevelSwitched)
      hlsRef.current = hls
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS — no WebKit-specific API usage, just set src
      video.src = src
      setQualityOptions([])
      setSelectedQuality(-1)
    } else {
      // Direct video URL fallback
      video.src = src
      setQualityOptions([])
      setSelectedQuality(-1)
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      transferBytesSinceSampleRef.current = 0
      lastTransferSampleAtRef.current = null
      lastMeasuredTransferKbpsRef.current = null
    }
  }, [addTransferBytes, deriveQualityOptions, src])

  useEffect(() => {
    if (!showStatsForNerds) return
    updateNerdStats()
    const timer = window.setInterval(updateNerdStats, NETWORK_SAMPLE_MS)
    return () => window.clearInterval(timer)
  }, [NETWORK_SAMPLE_MS, showStatsForNerds, updateNerdStats])

  useEffect(() => {
    setNetworkHistory([])
    transferBytesSinceSampleRef.current = 0
    lastTransferSampleAtRef.current = null
    lastMeasuredTransferKbpsRef.current = null
  }, [src])

  const clampStatsPosition = useCallback((x: number, y: number) => {
    const container = containerRef.current
    const statsCard = statsCardRef.current
    if (!container || !statsCard) return { x, y }

    const margin = 8
    const maxX = Math.max(margin, container.clientWidth - statsCard.offsetWidth - margin)
    const maxY = Math.max(margin, container.clientHeight - statsCard.offsetHeight - margin)

    return {
      x: Math.min(Math.max(x, margin), maxX),
      y: Math.min(Math.max(y, margin), maxY),
    }
  }, [])

  const onStatsDragStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const target = event.target as HTMLElement | null
      if (target?.closest("button")) return
      const container = containerRef.current
      const statsCard = statsCardRef.current
      if (!container || !statsCard) return

      event.preventDefault()
      event.stopPropagation()

      const containerRect = container.getBoundingClientRect()
      const cardRect = statsCard.getBoundingClientRect()
      statsDragOffsetRef.current = {
        x: event.clientX - cardRect.left,
        y: event.clientY - cardRect.top,
      }

      const next = clampStatsPosition(
        event.clientX - containerRect.left - statsDragOffsetRef.current.x,
        event.clientY - containerRect.top - statsDragOffsetRef.current.y
      )
      setStatsPosition(next)

      statsDragPointerIdRef.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [clampStatsPosition]
  )

  const onStatsDragMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (statsDragPointerIdRef.current !== event.pointerId) return
      const container = containerRef.current
      if (!container) return

      event.preventDefault()
      event.stopPropagation()

      const containerRect = container.getBoundingClientRect()
      const next = clampStatsPosition(
        event.clientX - containerRect.left - statsDragOffsetRef.current.x,
        event.clientY - containerRect.top - statsDragOffsetRef.current.y
      )
      setStatsPosition(next)
    },
    [clampStatsPosition]
  )

  const onStatsDragEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (statsDragPointerIdRef.current !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    statsDragPointerIdRef.current = null
  }, [])

  useEffect(() => {
    if (!showStatsForNerds) return
    const clamped = clampStatsPosition(statsPosition.x, statsPosition.y)
    if (clamped.x !== statsPosition.x || clamped.y !== statsPosition.y) {
      setStatsPosition(clamped)
    }
  }, [clampStatsPosition, isFullscreen, showStatsForNerds, statsPosition.x, statsPosition.y])

  useEffect(() => {
    if (!showStatsForNerds) return
    const onResize = () => {
      setStatsPosition((prev) => clampStatsPosition(prev.x, prev.y))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [clampStatsPosition, showStatsForNerds])

  useEffect(() => {
    const code = "332"
    const sequenceTimeoutMs = 5000
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }

      if (event.key.length !== 1) return
      const now = Date.now()
      if (
        lastKeyAtRef.current !== null &&
        now - lastKeyAtRef.current > sequenceTimeoutMs
      ) {
        keySequenceRef.current = ""
      }
      lastKeyAtRef.current = now

      const nextExpected = code[keySequenceRef.current.length]
      if (event.key === nextExpected) {
        keySequenceRef.current += event.key
      } else if (event.key === code[0]) {
        keySequenceRef.current = code[0]
      } else {
        keySequenceRef.current = ""
      }

      if (keySequenceRef.current === code) {
        setPanicMode((prev) => !prev)
        keySequenceRef.current = ""
        lastKeyAtRef.current = null
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (!panicMode) {
      setPanicTintIndex(0)
      return
    }
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = () => {
      if (!active) return
      setPanicTintIndex(Math.floor(Math.random() * PANIC_TINTS.length))
      const nextInMs = Math.floor(50 + Math.random() * 101)
      timer = setTimeout(tick, nextInMs)
    }

    tick()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [panicMode])

  const panicTint = PANIC_TINTS[panicTintIndex]

  const networkPeak = useMemo(() => {
    if (networkHistory.length === 0) return 1
    const sorted = [...networkHistory].sort((a, b) => a - b)
    const idx = Math.max(0, Math.floor(sorted.length * 0.9) - 1)
    return Math.max(1, sorted[idx] ?? 1)
  }, [networkHistory])
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
    const onRateChange = () => {
      setPlaybackRate(video.playbackRate)
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
    video.addEventListener("ratechange", onRateChange)
    video.addEventListener("ended", onEnded_)
    onRateChange()

    return () => {
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("timeupdate", onTimeUpdate)
      video.removeEventListener("durationchange", onDurationChange)
      video.removeEventListener("progress", onProgress)
      video.removeEventListener("waiting", onWaiting)
      video.removeEventListener("canplay", onCanPlay)
      video.removeEventListener("volumechange", onVolumeChange)
      video.removeEventListener("ratechange", onRateChange)
      video.removeEventListener("ended", onEnded_)
    }
  }, [onEnded])

  // Fullscreen change listener
  useEffect(() => {
    const video = videoRef.current as IOSVideoElement | null
    const webkitDocument = document as WebkitFullscreenDocument
    const onFullscreenChange = () => {
      setIsFullscreen(
        !!document.fullscreenElement ||
          !!webkitDocument.webkitFullscreenElement ||
          !!video?.webkitDisplayingFullscreen
      )
    }
    const onWebkitBeginFullscreen = () => setIsFullscreen(true)
    const onWebkitEndFullscreen = () => setIsFullscreen(false)

    if (video) {
      video.addEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen)
      video.addEventListener("webkitendfullscreen", onWebkitEndFullscreen)
    }

    document.addEventListener("fullscreenchange", onFullscreenChange)
    document.addEventListener("webkitfullscreenchange", onFullscreenChange)

    return () => {
      video?.removeEventListener(
        "webkitbeginfullscreen",
        onWebkitBeginFullscreen
      )
      video?.removeEventListener("webkitendfullscreen", onWebkitEndFullscreen)
      document.removeEventListener("fullscreenchange", onFullscreenChange)
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange)
    }
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

  const changePlaybackRate = useCallback((nextRate: number) => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = nextRate
    setPlaybackRate(nextRate)
  }, [])

  const changeQuality = useCallback((nextLevel: number) => {
    const hls = hlsRef.current
    if (!hls) return
    const normalizedLevel = Number.isInteger(nextLevel) ? nextLevel : -1
    hls.currentLevel = normalizedLevel
    hls.nextLevel = normalizedLevel
    hls.loadLevel = normalizedLevel
    setSelectedQuality(normalizedLevel)
  }, [])

  const promptRemotePlayback = useCallback(() => {
    const video = videoRef.current as WebKitAirPlayVideoElement | null
    if (!video) return

    if (isAppleDevice) {
      video.webkitShowPlaybackTargetPicker?.()
      return
    }

    if (!("remote" in video)) return
    video.remote.prompt().catch(() => {})
  }, [isAppleDevice])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    const video = videoRef.current as IOSVideoElement | null
    const webkitDocument = document as WebkitFullscreenDocument
    if (!container || !video) return

    const hasFullscreen =
      !!document.fullscreenElement ||
      !!webkitDocument.webkitFullscreenElement ||
      !!video.webkitDisplayingFullscreen

    if (hasFullscreen) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
        return
      }
      if (webkitDocument.webkitExitFullscreen) {
        void Promise.resolve(webkitDocument.webkitExitFullscreen()).catch(
          () => {}
        )
        return
      }
      if (video.webkitExitFullscreen) {
        video.webkitExitFullscreen()
        setIsFullscreen(false)
      }
      return
    }

    if (container.requestFullscreen) {
      container.requestFullscreen().catch(() => {
        if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen()
          setIsFullscreen(true)
        }
      })
      return
    }

    if (video.requestFullscreen) {
      video.requestFullscreen().catch(() => {
        if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen()
          setIsFullscreen(true)
        }
      })
      return
    }

    if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen()
      setIsFullscreen(true)
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
            "group relative overflow-hidden rounded-2xl bg-black fullscreen:rounded-none",
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
            x-webkit-airplay="allow"
            className="h-full w-full object-contain object-center"
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
            <div
              ref={statsCardRef}
              className="absolute z-20 max-h-[calc(100%-24px)] max-w-[min(92%,420px)] overflow-auto rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-[11px] text-white/90 backdrop-blur-md [scrollbar-color:rgba(255,255,255,0.28)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/28 [&::-webkit-scrollbar-track]:bg-transparent"
              style={{ left: `${statsPosition.x}px`, top: `${statsPosition.y}px` }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div
                className="mb-1 flex cursor-move touch-none items-center gap-2"
                onPointerDown={onStatsDragStart}
                onPointerMove={onStatsDragMove}
                onPointerUp={onStatsDragEnd}
                onPointerCancel={onStatsDragEnd}
              >
                <p className="font-medium tracking-wider text-white/70 uppercase">
                  Stats for nerds
                </p>
                <button
                  type="button"
                  aria-label="Close stats for nerds"
                  className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-sm text-white/70 transition-colors hover:bg-white/15 hover:text-white"
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    setShowStatsForNerds(false)
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
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
                <span className="text-white/65">ready/network</span>
                <span>
                  {nerdStats.readyState} / {nerdStats.networkState}
                </span>
                <span className="text-white/65">Ranges</span>
                <span>
                  buffered {nerdStats.bufferedRanges} · seekable{" "}
                  {nerdStats.seekableRanges}
                </span>
                <span className="text-white/65">Mux playback ID</span>
                <span className="truncate">
                  {nerdStats.muxPlaybackId ?? "-"}
                </span>
                <span className="text-white/65">Source host</span>
                <span className="truncate">{nerdStats.sourceHost ?? "-"}</span>
                <span className="text-white/65">Source path</span>
                <span className="truncate">{nerdStats.sourcePath ?? "-"}</span>
                {nerdStats.hlsLevelLabel && (
                  <>
                    <span className="text-white/65">HLS level</span>
                    <span>{nerdStats.hlsLevelLabel}</span>
                  </>
                )}
                <span className="text-white/65">HLS indexes</span>
                <span>
                  cur {nerdStats.hlsCurrentLevel ?? "-"} · load{" "}
                  {nerdStats.hlsLoadLevel ?? "-"} · auto{" "}
                  {nerdStats.hlsNextAutoLevel ?? "-"}
                </span>
                <span className="text-white/65">HLS levels</span>
                <span>{nerdStats.hlsLevelCount}</span>
                <span className="text-white/65">HLS latency</span>
                <span>
                  {nerdStats.hlsLatencySec ?? "-"}s · drift{" "}
                  {nerdStats.hlsDrift ?? "-"}
                </span>
                <span className="text-white/65">Codecs</span>
                <span className="truncate">{nerdStats.hlsCodecs ?? "-"}</span>
              </div>
            </div>
          )}

          {panicMode && (
            <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-20 flex flex-col items-start gap-0.5 overflow-hidden">
              {Array.from({ length: 64 }).map((_, i) => (
                <span
                  key={i}
                  className="[animation:panic-text-flash_420ms_steps(2,end)_infinite] text-[10px] leading-none font-black tracking-tight text-red-500 [text-shadow:0_0_4px_rgba(255,0,0,0.95)]"
                >
                  Panic!
                </span>
              ))}
            </div>
          )}

          {title && (
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 z-20 transition-opacity duration-300",
                controlsVisible ? "opacity-100" : "opacity-0"
              )}
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, oklch(0 0 0 / 68%) 0%, transparent 100%)",
                }}
              />
              <div className="relative z-10 px-4 pt-3 pb-6">
                <p className="truncate text-sm font-medium text-white/95">{title}</p>
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
              className="absolute inset-0 rounded-b-2xl fullscreen:rounded-none"
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
                <ScrubBarTrack
                  className={cn(
                    "h-1.5 transition-[height] duration-150 ease-out hover:h-2",
                    panicMode && "transition-colors duration-75"
                  )}
                  style={
                    panicMode
                      ? {
                          borderColor: panicTint.line,
                          backgroundColor: panicTint.trackBg,
                          ["--panic-line" as string]: panicTint.line,
                          ["--panic-glow" as string]: panicTint.thumbGlow,
                        }
                      : undefined
                  }
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-white/25"
                    style={{
                      width: `${bufferedProgress}%`,
                      ...(panicMode
                        ? {
                            backgroundColor: panicTint.bufferBg,
                          }
                        : null),
                    }}
                  />
                  <ScrubBarProgress
                    className={cn(panicMode && "bg-[var(--panic-line)]")}
                  />
                  <ScrubBarThumb
                    className={cn(
                      panicMode &&
                        "bg-[var(--panic-line)] shadow-[0_0_10px_var(--panic-glow)]"
                    )}
                  />
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

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        className="glass-button glass-button-ghost flex h-9 w-9 items-center justify-center rounded-full text-white/95 hover:text-white"
                        aria-label="Playback settings"
                        title="Playback settings"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                      />
                    }
                  >
                    <Settings className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    align="end"
                    sideOffset={8}
                    alignOffset={0}
                    portalContainer={isFullscreen ? containerRef.current : undefined}
                    className="min-w-[210px] rounded-xl border border-white/20 bg-black/62 p-1.5 text-[14px] text-white/92 backdrop-blur-lg"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="rounded-lg px-3 py-2 text-[14px] font-medium">
                        Speed
                        <span className="ml-auto text-[12px] text-white/65">
                          {playbackRate}x
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        className="min-w-[150px] rounded-xl border border-white/20 bg-black/62 p-1.5 text-[14px] text-white/92 backdrop-blur-lg"
                        sideOffset={8}
                      >
                        {PLAYBACK_SPEEDS.map((rate) => (
                          <DropdownMenuItem
                            key={rate}
                            className="rounded-lg px-3 py-2 text-[14px]"
                            onClick={() => changePlaybackRate(rate)}
                          >
                            <span className="font-medium">
                              {rate === 1 ? "Normal" : `${rate}x`}
                            </span>
                            {playbackRate === rate && (
                              <Check className="ml-auto h-4 w-4 text-white/85" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        className={cn(
                          "rounded-lg px-3 py-2 text-[14px] font-medium",
                          qualityOptions.length <= 1 &&
                            "pointer-events-none opacity-60"
                        )}
                      >
                        Quality
                        <span className="ml-auto max-w-[70px] truncate text-[12px] text-white/65">
                          {selectedQuality === -1
                            ? "Auto"
                            : qualityOptions
                                .find((option) => option.value === selectedQuality)
                                ?.label.split("·")[0]
                                ?.trim() ?? "Manual"}
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        className="max-h-56 min-w-[220px] rounded-xl border border-white/20 bg-black/62 p-1.5 text-[14px] text-white/92 backdrop-blur-lg"
                        sideOffset={8}
                      >
                        {qualityOptions.length > 1 ? (
                          qualityOptions.map((option) => (
                            <DropdownMenuItem
                              key={option.value}
                              className="rounded-lg px-3 py-2 text-[13px]"
                              onClick={() => changeQuality(option.value)}
                            >
                              <span className="pr-2">{option.label}</span>
                              {selectedQuality === option.value && (
                                <Check className="ml-auto h-4 w-4 shrink-0 text-white/85" />
                              )}
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <DropdownMenuItem
                            disabled
                            className="rounded-lg px-3 py-2 text-[13px] text-white/60"
                          >
                            Quality unavailable
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>

                {remotePlaybackAvailable && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      promptRemotePlayback()
                    }}
                    className="glass-button glass-button-ghost flex h-9 w-9 items-center justify-center rounded-full text-white/95 hover:text-white"
                    aria-label={isAppleDevice ? "AirPlay" : "Cast to device"}
                    title={isAppleDevice ? "AirPlay" : "Cast"}
                  >
                    {isAppleDevice ? (
                      <Airplay className="h-4 w-4" />
                    ) : (
                      <Cast className="h-4 w-4" />
                    )}
                  </button>
                )}

                {onDownload && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      onDownload()
                    }}
                    className="glass-button glass-button-ghost flex h-9 w-9 items-center justify-center rounded-full text-white/95 hover:text-white"
                    aria-label="Download video"
                    title="Download video"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                )}

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
      <ContextMenuContent portalContainer={isFullscreen ? containerRef.current : undefined}>
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
