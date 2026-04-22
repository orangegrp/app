"use client"

import { Music2, Pause, Play } from "lucide-react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useAudioPlayer } from "@/components/ui/audio-player"
import { useOptionalMusicContext } from "@/components/music/MusicContext"

interface SidebarMusicMiniProps {
  collapsed: boolean
  onOpenNowPlaying: () => void
}

export function SidebarMusicMini({
  collapsed,
  onOpenNowPlaying,
}: SidebarMusicMiniProps) {
  const ctx = useOptionalMusicContext()
  const player = useAudioPlayer()
  const pathname = usePathname()

  const currentTrack = ctx?.currentTrack ?? null
  const isOnMusicPage = pathname === "/music" || pathname.startsWith("/music/")

  // Hide while the user is on the music page — the bottom player bar handles that
  if (!currentTrack || isOnMusicPage) return null

  if (collapsed) {
    return (
      <div className="border-t border-white/5 px-2 pt-2 pb-1">
        <button
          onClick={onOpenNowPlaying}
          title={`${currentTrack.title} — ${currentTrack.artist}`}
          className="relative flex w-full items-center justify-center rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          {currentTrack.coverUrl ? (
            <Image
              src={currentTrack.coverUrl}
              alt=""
              width={17}
              height={17}
              unoptimized
              className="h-[17px] w-[17px] rounded object-cover"
            />
          ) : (
            <Music2 size={17} strokeWidth={1.5} />
          )}
          {player.isPlaying && (
            <span className="absolute top-2 right-2 h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/60" />
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="border-t border-white/5 px-2 pt-2 pb-1">
      <div
        className="flex items-center gap-2 rounded-xl px-2 py-1.5"
        style={{ background: "oklch(1 0 0 / 4%)" }}
      >
        {/* Cover art — click opens now playing */}
        <button
          onClick={onOpenNowPlaying}
          className="shrink-0"
          aria-label="Open now playing"
        >
          <div className="h-8 w-8 overflow-hidden rounded-md bg-foreground/5">
            {currentTrack.coverUrl ? (
              <Image
                src={currentTrack.coverUrl}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music2 className="h-3.5 w-3.5 text-muted-foreground/30" />
              </div>
            )}
          </div>
        </button>

        {/* Title + artist */}
        <button
          onClick={onOpenNowPlaying}
          className="min-w-0 flex-1 text-left"
          aria-label="Open now playing"
        >
          <p className="truncate text-xs leading-snug font-medium text-foreground">
            {currentTrack.title}
          </p>
          <p className="truncate text-[10px] leading-snug text-muted-foreground">
            {currentTrack.artist}
          </p>
        </button>

        {/* Play / pause */}
        <button
          onClick={() => (player.isPlaying ? player.pause() : player.play())}
          aria-label={player.isPlaying ? "Pause" : "Play"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors"
          style={{ background: "oklch(1 0 0 / 8%)" }}
        >
          {player.isPlaying ? (
            <Pause className="h-3 w-3 fill-current text-foreground" />
          ) : (
            <Play className="ml-0.5 h-3 w-3 fill-current text-foreground" />
          )}
        </button>
      </div>
    </div>
  )
}
