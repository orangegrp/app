"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useAudioPlayer } from "@/components/ui/audio-player"
import { fetchMusicTracks, type MusicTrackMeta } from "@/lib/music-api"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/lib/auth-store"
import { PERMISSIONS } from "@/lib/permissions"
import { useIsMobile } from "@/hooks/use-mobile"

interface MusicContextValue {
  tracks: MusicTrackMeta[]
  currentTrackId: string | null
  currentTrack: MusicTrackMeta | null
  playTrack: (id: string) => void
  playNext: () => void
  playPrev: () => void
  addTrack: (track: MusicTrackMeta) => void
  removeTrack: (id: string) => void
  isCreatorMode: boolean
  setCreatorMode: (v: boolean) => void
  isCreator: boolean
  loading: boolean
  error: string | null
  nowPlayingOpen: boolean
  openNowPlaying: () => void
  closeNowPlaying: () => void
}

const MusicContext = createContext<MusicContextValue | null>(null)

export function useMusicContext(): MusicContextValue {
  const ctx = useContext(MusicContext)
  if (!ctx) throw new Error("useMusicContext must be used inside MusicProvider")
  return ctx
}

/** Returns null when called outside MusicProvider — for optional consumers. */
export function useOptionalMusicContext(): MusicContextValue | null {
  return useContext(MusicContext)
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer<MusicTrackMeta>()
  const user = useAuthStore((s) => s.user)
  const isMobile = useIsMobile()
  const isCreator = user ? hasPermission(user.permissions, PERMISSIONS.APP_MUSIC_UPLOAD) : false
  const hasMusic = user ? hasPermission(user.permissions, PERMISSIONS.APP_MUSIC) : false

  const [tracks, setTracks] = useState<MusicTrackMeta[]>([])
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null)
  const [isCreatorMode, setCreatorMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)

  // Keep a stable ref to tracks so callbacks don't stale-close
  const tracksRef = useRef(tracks)
  useEffect(() => { tracksRef.current = tracks }, [tracks])

  useEffect(() => {
    // Only fetch if user has music access; skip otherwise to avoid unnecessary requests
    if (!user) return
    if (!hasMusic) { setLoading(false); return }
    fetchMusicTracks()
      .then(({ tracks: fetched }) => {
        setTracks(fetched)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tracks"))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMusic, !!user])

  const currentTrack = tracks.find((t) => t.id === currentTrackId) ?? null

  const playTrack = useCallback((id: string) => {
    const track = tracksRef.current.find((t) => t.id === id)
    if (!track) return
    setCurrentTrackId(id)
    player.play({ id: track.id, src: track.audioUrl, data: track })
    if (isMobile) setNowPlayingOpen(true)
  }, [player, isMobile])

  const playNext = useCallback(() => {
    const list = tracksRef.current
    if (!list.length) return
    const idx = list.findIndex((t) => t.id === currentTrackId)
    const next = list[(idx + 1) % list.length]
    if (next) playTrack(next.id)
  }, [currentTrackId, playTrack])

  const playPrev = useCallback(() => {
    const list = tracksRef.current
    if (!list.length) return
    const idx = list.findIndex((t) => t.id === currentTrackId)
    const prev = list[(idx - 1 + list.length) % list.length]
    if (prev) playTrack(prev.id)
  }, [currentTrackId, playTrack])

  const addTrack = useCallback((track: MusicTrackMeta) => {
    setTracks((prev) => [track, ...prev])
  }, [])

  const removeTrack = useCallback((id: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== id))
    if (currentTrackId === id) {
      player.pause()
      setCurrentTrackId(null)
    }
  }, [currentTrackId, player])

  return (
    <MusicContext.Provider value={{
      tracks, currentTrackId, currentTrack,
      playTrack, playNext, playPrev,
      addTrack, removeTrack,
      isCreatorMode, setCreatorMode, isCreator,
      loading, error,
      nowPlayingOpen,
      openNowPlaying: () => setNowPlayingOpen(true),
      closeNowPlaying: () => setNowPlayingOpen(false),
    }}>
      {children}
    </MusicContext.Provider>
  )
}
