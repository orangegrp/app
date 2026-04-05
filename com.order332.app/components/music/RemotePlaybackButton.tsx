"use client"

import { useEffect, useState } from "react"
import { Airplay, Cast } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAudioPlayer } from "@/components/ui/audio-player"

interface RemotePlaybackButtonProps {
  className?: string
}

// Safari/WebKit exposes this global; presence means AirPlay is the mechanism.
const isApple = typeof window !== "undefined" && /Apple/.test(navigator.vendor)

/**
 * Shows an AirPlay or Cast button when the browser detects at least one remote
 * playback device. Uses the W3C Remote Playback API — hidden on unsupported
 * browsers. Shows the AirPlay icon on Apple/Safari, Cast icon elsewhere.
 */
export function RemotePlaybackButton({ className }: RemotePlaybackButtonProps) {
  const player = useAudioPlayer()
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const audio = player.ref.current
    if (!audio || !("remote" in audio)) return

    const remote = audio.remote
    let watchId: number | undefined

    remote
      .watchAvailability((avail) => setAvailable(avail))
      .then((id) => { watchId = id })
      .catch(() => { /* NotSupportedError — feature unavailable in this env */ })

    return () => {
      if (watchId != null) {
        remote.cancelWatchAvailability(watchId).catch(() => {})
      }
    }
  }, []) // player.ref is stable — runs once on mount

  if (!available) return null

  const Icon = isApple ? Airplay : Cast

  return (
    <button
      onClick={() => {
        const audio = player.ref.current
        if (!audio || !("remote" in audio)) return
        audio.remote.prompt().catch(() => {})
      }}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
        "glass-button glass-button-ghost text-muted-foreground hover:text-foreground",
        className,
      )}
      aria-label={isApple ? "AirPlay" : "Cast to device"}
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}
