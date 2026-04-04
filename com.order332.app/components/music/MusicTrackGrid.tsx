"use client"

import { useAudioPlayer } from "@/components/ui/audio-player"
import { MusicTrackCard } from "./MusicTrackCard"
import { useMusicContext } from "./MusicContext"
import { deleteMusicTrack, type MusicTrackMeta } from "@/lib/music-api"

export function MusicTrackGrid() {
  const { tracks, currentTrackId, playTrack, removeTrack, isCreatorMode } = useMusicContext()
  const player = useAudioPlayer()

  if (tracks.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-foreground/10">
        <p className="text-sm text-muted-foreground tracking-wider">No tracks yet.</p>
      </div>
    )
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMusicTrack(id)
      removeTrack(id)
    } catch (err) {
      console.error('[MusicTrackGrid] delete error:', err)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {tracks.map((track) => {
        const isActive = track.id === currentTrackId
        return (
          <MusicTrackCard
            key={track.id}
            track={track}
            isActive={isActive}
            isPlaying={isActive && player.isPlaying}
            onPlay={() => {
              if (isActive && player.isPlaying) {
                player.pause()
              } else {
                playTrack(track.id)
              }
            }}
            isCreator={isCreatorMode}
            onDelete={handleDelete}
          />
        )
      })}
    </div>
  )
}
