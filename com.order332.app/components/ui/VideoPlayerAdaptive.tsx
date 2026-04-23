"use client"

import { useEffect, useRef, useState } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { VideoPlayer } from "@/components/ui/VideoPlayer"
import { VideoPlayerMobile } from "@/components/ui/VideoPlayerMobile"

interface VideoPlayerAdaptiveProps {
  src: string
  poster?: string
  title?: string
  className?: string
  autoPlay?: boolean
  onEnded?: () => void
  onDownload?: () => void
  onVariantChange?: (variant: "default" | "mobile") => void
  onClose?: () => void
}

const DESKTOP_MOBILE_PREF_KEY = "video-player:desktop-mobile-enabled"

export function VideoPlayerAdaptive(props: VideoPlayerAdaptiveProps) {
  const { onVariantChange, onClose, ...playerProps } = props
  const isMobile = useIsMobile()
  const [isMobileOs, setIsMobileOs] = useState(false)
  const [desktopMobileEnabled, setDesktopMobileEnabled] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const contextActiveRef = useRef(false)
  const keySequenceRef = useRef("")
  const lastKeyAtRef = useRef<number | null>(null)

  useEffect(() => {
    setHydrated(true)
    try {
      const ua = navigator.userAgent || ""
      const platform = navigator.platform || ""
      const touchPoints = navigator.maxTouchPoints || 0
      const isiOS = /iPhone|iPad|iPod/i.test(ua) || (platform === "MacIntel" && touchPoints > 1)
      const isAndroid = /Android/i.test(ua)
      setIsMobileOs(isiOS || isAndroid)
    } catch {
      setIsMobileOs(false)
    }
    try {
      const raw = localStorage.getItem(DESKTOP_MOBILE_PREF_KEY)
      setDesktopMobileEnabled(raw === "1")
    } catch {
      setDesktopMobileEnabled(false)
    }
  }, [])

  useEffect(() => {
    const sequence = "mp"
    const sequenceTimeoutMs = 5000

    const onKeyDown = (event: KeyboardEvent) => {
      if (isMobile) return
      if (!contextActiveRef.current) return

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
      const key = event.key.toLowerCase()

      const now = Date.now()
      if (
        lastKeyAtRef.current !== null &&
        now - lastKeyAtRef.current > sequenceTimeoutMs
      ) {
        keySequenceRef.current = ""
      }
      lastKeyAtRef.current = now

      const nextExpected = sequence[keySequenceRef.current.length]
      if (key === nextExpected) {
        keySequenceRef.current += key
      } else if (key === sequence[0]) {
        keySequenceRef.current = sequence[0]
      } else {
        keySequenceRef.current = ""
      }

      if (keySequenceRef.current === sequence) {
        keySequenceRef.current = ""
        lastKeyAtRef.current = null
        setDesktopMobileEnabled((prev) => {
          const next = !prev
          try {
            localStorage.setItem(DESKTOP_MOBILE_PREF_KEY, next ? "1" : "0")
          } catch {
            // no-op
          }
          return next
        })
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isMobile])

  const useMobilePlayer = isMobile || isMobileOs || (hydrated && desktopMobileEnabled)
  useEffect(() => {
    onVariantChange?.(useMobilePlayer ? "mobile" : "default")
  }, [onVariantChange, useMobilePlayer])

  return (
    <div
      className="h-full w-full"
      onMouseEnter={() => {
        contextActiveRef.current = true
      }}
      onMouseLeave={() => {
        contextActiveRef.current = false
      }}
      onPointerDown={() => {
        contextActiveRef.current = true
      }}
      onFocusCapture={() => {
        contextActiveRef.current = true
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          contextActiveRef.current = false
        }
      }}
    >
      {useMobilePlayer ? (
        <VideoPlayerMobile {...playerProps} onClose={onClose} />
      ) : (
        <VideoPlayer {...playerProps} />
      )}
    </div>
  )
}
