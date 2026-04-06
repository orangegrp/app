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
import {
  useAudioPlayer,
  useAudioPlayerTime,
} from "@/components/ui/audio-player"
import {
  fetchMusicTracks,
  fetchMusicPlaylists,
  addTrackToPlaylist as apiAddTrackToPlaylist,
  removeTrackFromPlaylist as apiRemoveTrackFromPlaylist,
  createMusicPlaylist as apiCreatePlaylist,
  deleteMusicPlaylist as apiDeletePlaylist,
  updateMusicPlaylist as apiUpdatePlaylist,
  type MusicTrackMeta,
  type MusicPlaylistMeta,
  type LoopMode,
} from "@/lib/music-api"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/lib/auth-store"
import { PERMISSIONS } from "@/lib/permissions"
import { useIsMobile } from "@/hooks/use-mobile"
import { moveItem } from "@/lib/music-queue"

function shuffleArray(arr: string[], firstId?: string): string[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  if (firstId) {
    const idx = copy.indexOf(firstId)
    if (idx > 0) {
      copy.splice(idx, 1)
      copy.unshift(firstId)
    }
  }
  return copy
}

interface MusicContextValue {
  // Track library
  tracks: MusicTrackMeta[]
  currentTrackId: string | null
  currentTrack: MusicTrackMeta | null
  loading: boolean
  error: string | null

  // Playback queue state (exposed for UI)
  queue: string[] // current main queue (original order)
  shuffledQueue: string[] // shuffle permutation used when active
  upNext: string[] // manual "play next" additions
  shuffle: boolean
  loop: LoopMode

  // Player sheet
  nowPlayingOpen: boolean
  openNowPlaying: () => void
  closeNowPlaying: () => void

  // Playback controls
  playTrack: (id: string, newQueue?: string[]) => void
  playNext: () => void
  playPrev: () => void
  addToQueue: (id: string) => void
  playNextTrack: (id: string) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  toggleShuffle: () => void
  setLoop: (mode: LoopMode) => void
  reorderQueue: (from: number, to: number) => void

  // Convenience: play all / play album / play playlist with optional shuffle
  playAll: (shuffle?: boolean) => void
  playAlbum: (album: string, startId?: string, shuffle?: boolean) => void
  playPlaylist: (
    tracks: MusicTrackMeta[],
    startId?: string,
    shuffle?: boolean
  ) => void

  // Track management
  addTrack: (track: MusicTrackMeta) => void
  removeTrack: (id: string) => void
  updateTrack: (track: MusicTrackMeta) => void

  // Creator mode
  isCreatorMode: boolean
  setCreatorMode: (v: boolean) => void
  isCreator: boolean

  // Playlists
  playlists: MusicPlaylistMeta[]
  playlistsLoading: boolean
  refreshPlaylists: () => Promise<void>
  createPlaylist: (
    name: string,
    description?: string | null
  ) => Promise<MusicPlaylistMeta>
  deletePlaylist: (id: string) => Promise<void>
  renamePlaylist: (id: string, name: string) => Promise<void>
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>
  removeTrackFromPlaylist: (
    playlistId: string,
    trackId: string
  ) => Promise<void>
}

const MusicContext = createContext<MusicContextValue | null>(null)

export function useMusicContext(): MusicContextValue {
  const ctx = useContext(MusicContext)
  if (!ctx) throw new Error("useMusicContext must be used inside MusicProvider")
  return ctx
}

export function useOptionalMusicContext(): MusicContextValue | null {
  return useContext(MusicContext)
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer<MusicTrackMeta>()
  const currentTime = useAudioPlayerTime()
  const user = useAuthStore((s) => s.user)
  const isMobile = useIsMobile()
  const isCreator = user
    ? hasPermission(user.permissions, PERMISSIONS.APP_MUSIC_UPLOAD)
    : false
  const hasMusic = user
    ? hasPermission(user.permissions, PERMISSIONS.APP_MUSIC)
    : false

  // Track library
  const [tracks, setTracks] = useState<MusicTrackMeta[]>([])
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null)
  const [isCreatorMode, setCreatorMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)

  // Playback queue
  const [queue, setQueue] = useState<string[]>([])
  const [shuffledQueue, setShuffledQueue] = useState<string[]>([])
  const [upNext, setUpNext] = useState<string[]>([])
  const [shuffle, setShuffle] = useState(false)
  const [loop, setLoop] = useState<LoopMode>("none")

  // Playlists
  const [playlists, setPlaylists] = useState<MusicPlaylistMeta[]>([])
  const [playlistsLoading, setPlaylistsLoading] = useState(true)

  // Stable refs — updated synchronously during render so they are always
  // current by the time any effect (child or parent) runs. Using useEffect
  // for this caused child-component effects to see stale values because
  // React runs child effects before parent effects.
  const tracksRef = useRef(tracks)
  const currentTrackIdRef = useRef(currentTrackId)
  const queueRef = useRef(queue)
  const shuffledQueueRef = useRef(shuffledQueue)
  const upNextRef = useRef(upNext)
  const shuffleRef = useRef(shuffle)
  const loopRef = useRef(loop)

  tracksRef.current = tracks
  currentTrackIdRef.current = currentTrackId
  queueRef.current = queue
  shuffledQueueRef.current = shuffledQueue
  upNextRef.current = upNext
  shuffleRef.current = shuffle
  loopRef.current = loop

  // Load tracks
  useEffect(() => {
    if (!user) return
    if (!hasMusic) {
      setLoading(false)
      return
    }
    fetchMusicTracks()
      .then(({ tracks: fetched }) => {
        setTracks(fetched)
        setError(null)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load tracks")
      )
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMusic, !!user])

  // Load playlists
  useEffect(() => {
    if (!user || !hasMusic) {
      setPlaylistsLoading(false)
      return
    }
    fetchMusicPlaylists()
      .then(({ playlists: fetched }) => setPlaylists(fetched))
      .catch(() => {})
      .finally(() => setPlaylistsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMusic, !!user])

  const currentTrack = tracks.find((t) => t.id === currentTrackId) ?? null

  // ── Media Session ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return
    if (!currentTrack) {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.playbackState = "none"
      return
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist ?? "",
      album: currentTrack.album ?? "",
      artwork: currentTrack.coverUrl
        ? [{ src: currentTrack.coverUrl, sizes: "512x512" }]
        : [],
    })
  }, [currentTrack])

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return
    const duration = player.duration
    if (!duration || !Number.isFinite(duration) || duration <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: player.playbackRate,
        position: Math.min(Math.max(currentTime, 0), duration),
      })
    } catch (err) {
      console.error("[music/context] media session position error", err)
    }
  }, [currentTime, player.duration, player.playbackRate])

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return
    navigator.mediaSession.playbackState = player.isPlaying
      ? "playing"
      : "paused"
  }, [player.isPlaying])

  // ── Native loop ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const audio = player.ref.current
    if (!audio) return
    audio.loop = loop === "track"
  }, [loop, player.ref])

  // ── Core play helper (internal) ──────────────────────────────────────────────

  const _playById = useCallback(
    (id: string) => {
      const track = tracksRef.current.find((t) => t.id === id)
      if (!track) return
      setCurrentTrackId(id)
      player.play({ id: track.id, src: track.audioUrl, data: track })
      if (isMobile) setNowPlayingOpen(true)
    },
    [player, isMobile]
  )

  const ensureQueueLoaded = useCallback(() => {
    if (queueRef.current.length > 0) return
    const allIds = tracksRef.current.map((t) => t.id)
    if (allIds.length === 0) return
    setQueue(allIds)
    if (shuffleRef.current) {
      setShuffledQueue(
        shuffleArray(allIds, currentTrackIdRef.current ?? undefined)
      )
    }
  }, [])

  // ── Public playTrack ─────────────────────────────────────────────────────────

  const playTrack = useCallback(
    (id: string, newQueue?: string[]) => {
      if (newQueue) {
        setQueue(newQueue)
        if (shuffleRef.current) {
          const sh = shuffleArray(newQueue, id)
          setShuffledQueue(sh)
        }
      } else if (queueRef.current.length === 0) {
        const allIds = tracksRef.current.map((t) => t.id)
        setQueue(allIds)
        if (shuffleRef.current) setShuffledQueue(shuffleArray(allIds, id))
      }
      _playById(id)
    },
    [_playById]
  )

  // ── playNext / playPrev ──────────────────────────────────────────────────────

  const playNextRef = useRef<() => void>(() => {})
  const playPrevRef = useRef<() => void>(() => {})

  const playNext = useCallback(() => {
    if (loopRef.current === "track") return // native audio.loop handles it

    if (upNextRef.current.length > 0) {
      const [nextId, ...rest] = upNextRef.current
      setUpNext(rest)
      _playById(nextId)
      return
    }

    const effective = shuffleRef.current
      ? shuffledQueueRef.current
      : queueRef.current
    if (effective.length === 0) return
    const idx = effective.indexOf(currentTrackIdRef.current ?? "")
    const nextIdx = idx + 1

    if (nextIdx < effective.length) {
      _playById(effective[nextIdx])
    } else if (loopRef.current === "all") {
      _playById(effective[0])
    }
  }, [_playById])

  const playPrev = useCallback(() => {
    const effective = shuffleRef.current
      ? shuffledQueueRef.current
      : queueRef.current
    if (effective.length === 0) return
    const idx = effective.indexOf(currentTrackIdRef.current ?? "")
    const prevIdx = idx <= 0 ? effective.length - 1 : idx - 1
    _playById(effective[prevIdx])
  }, [_playById])

  // Keep refs updated so auto-advance can call current version
  useEffect(() => {
    playNextRef.current = playNext
  }, [playNext])
  useEffect(() => {
    playPrevRef.current = playPrev
  }, [playPrev])

  // ── Auto-advance on track end ─────────────────────────────────────────────────

  useEffect(() => {
    const audio = player.ref.current
    if (!audio) return
    const handle = () => {
      if (loopRef.current !== "track") playNextRef.current()
    }
    audio.addEventListener("ended", handle)
    return () => audio.removeEventListener("ended", handle)
  }, [player.ref])

  // ── Media Session action handlers ────────────────────────────────────────────

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return
    navigator.mediaSession.setActionHandler("play", () => player.play())
    navigator.mediaSession.setActionHandler("pause", () => player.pause())
    navigator.mediaSession.setActionHandler("previoustrack", () =>
      playPrevRef.current()
    )
    navigator.mediaSession.setActionHandler("nexttrack", () =>
      playNextRef.current()
    )
    return () => {
      navigator.mediaSession.setActionHandler("play", null)
      navigator.mediaSession.setActionHandler("pause", null)
      navigator.mediaSession.setActionHandler("previoustrack", null)
      navigator.mediaSession.setActionHandler("nexttrack", null)
    }
  }, [player.play, player.pause])

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return
    const handler = (details: MediaSessionActionDetails) => {
      if (details.seekTime == null) return
      const duration = player.duration ?? 0
      const target = Math.min(
        Math.max(details.seekTime, 0),
        duration > 0 ? duration : details.seekTime
      )
      if (details.fastSeek && player.ref.current?.fastSeek) {
        player.ref.current.fastSeek(target)
      } else {
        player.seek(target)
      }
      if (player.isPlaying) {
        void player.play()
      }
    }
    navigator.mediaSession.setActionHandler("seekto", handler)
    return () => {
      navigator.mediaSession.setActionHandler("seekto", null)
    }
  }, [player, player.seek, player.play])

  // ── Queue management ─────────────────────────────────────────────────────────

  const addToQueue = useCallback((id: string) => {
    setUpNext((prev) => [...prev, id])
  }, [])

  const playNextTrack = useCallback((id: string) => {
    setUpNext((prev) => [id, ...prev])
  }, [])

  const removeFromQueue = useCallback((index: number) => {
    setUpNext((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearQueue = useCallback(() => {
    setUpNext([])
    const currentId = currentTrackIdRef.current
    if (currentId) {
      setQueue([currentId])
      setShuffledQueue([currentId])
      return
    }
    setQueue([])
    setShuffledQueue([])
  }, [])
  const reorderQueue = useCallback((from: number, to: number) => {
    setUpNext((prev) => moveItem(prev, from, to))
  }, [])

  // ── Shuffle ───────────────────────────────────────────────────────────────────

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => {
      const next = !prev
      ensureQueueLoaded()
      if (next && queueRef.current.length > 0) {
        setShuffledQueue(
          shuffleArray(queueRef.current, currentTrackIdRef.current ?? undefined)
        )
      }
      return next
    })
  }, [ensureQueueLoaded])

  // ── Convenience play methods ─────────────────────────────────────────────────

  const playAll = useCallback(
    (doShuffle = false) => {
      const all = tracksRef.current.map((t) => t.id)
      if (all.length === 0) return
      if (doShuffle) {
        const sh = shuffleArray(all)
        setShuffle(true)
        setShuffledQueue(sh)
        setQueue(all)
        _playById(sh[0])
      } else {
        setShuffle(false)
        setQueue(all)
        _playById(all[0])
      }
    },
    [_playById]
  )

  const playAlbum = useCallback(
    (album: string, startId?: string, doShuffle = false) => {
      const albumTracks = tracksRef.current.filter((t) => t.album === album)
      if (albumTracks.length === 0) return
      const ids = albumTracks.map((t) => t.id)
      if (doShuffle) {
        const sh = shuffleArray(ids, startId)
        setShuffle(true)
        setShuffledQueue(sh)
        setQueue(ids)
        _playById(sh[0])
      } else {
        setShuffle(false)
        setQueue(ids)
        _playById(startId ?? ids[0])
      }
    },
    [_playById]
  )

  const playPlaylist = useCallback(
    (playlistTracks: MusicTrackMeta[], startId?: string, doShuffle = false) => {
      if (playlistTracks.length === 0) return
      const ids = playlistTracks.map((t) => t.id)
      if (doShuffle) {
        const sh = shuffleArray(ids, startId)
        setShuffle(true)
        setShuffledQueue(sh)
        setQueue(ids)
        _playById(sh[0])
      } else {
        setShuffle(false)
        setQueue(ids)
        _playById(startId ?? ids[0])
      }
    },
    [_playById]
  )

  // ── Track library management ─────────────────────────────────────────────────

  const addTrack = useCallback((track: MusicTrackMeta) => {
    setTracks((prev) => [track, ...prev])
  }, [])

  const updateTrack = useCallback((track: MusicTrackMeta) => {
    setTracks((prev) => prev.map((t) => (t.id === track.id ? track : t)))
  }, [])

  const removeTrack = useCallback(
    (id: string) => {
      setTracks((prev) => prev.filter((t) => t.id !== id))
      setQueue((prev) => prev.filter((qid) => qid !== id))
      setShuffledQueue((prev) => prev.filter((qid) => qid !== id))
      setUpNext((prev) => prev.filter((qid) => qid !== id))
      if (currentTrackIdRef.current === id) {
        player.pause()
        setCurrentTrackId(null)
      }
    },
    [player]
  )

  // ── Playlist management ──────────────────────────────────────────────────────

  const refreshPlaylists = useCallback(async () => {
    const { playlists: fetched } = await fetchMusicPlaylists()
    setPlaylists(fetched)
  }, [])

  const createPlaylist = useCallback(
    async (
      name: string,
      description?: string | null
    ): Promise<MusicPlaylistMeta> => {
      const { playlist } = await apiCreatePlaylist(name, description)
      setPlaylists((prev) => [playlist, ...prev])
      return playlist
    },
    []
  )

  const deletePlaylist = useCallback(async (id: string) => {
    await apiDeletePlaylist(id)
    setPlaylists((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const renamePlaylist = useCallback(async (id: string, name: string) => {
    const { playlist } = await apiUpdatePlaylist(id, { name })
    setPlaylists((prev) => prev.map((p) => (p.id === id ? playlist : p)))
  }, [])

  const addTrackToPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      await apiAddTrackToPlaylist(playlistId, trackId)
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId
            ? {
                ...p,
                trackCount: p.trackCount + 1,
                updatedAt: new Date().toISOString(),
              }
            : p
        )
      )
    },
    []
  )

  const removeTrackFromPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      await apiRemoveTrackFromPlaylist(playlistId, trackId)
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId
            ? {
                ...p,
                trackCount: Math.max(0, p.trackCount - 1),
                updatedAt: new Date().toISOString(),
              }
            : p
        )
      )
    },
    []
  )

  return (
    <MusicContext.Provider
      value={{
        tracks,
        currentTrackId,
        currentTrack,
        loading,
        error,
        queue,
        shuffledQueue,
        upNext,
        shuffle,
        loop,
        nowPlayingOpen,
        openNowPlaying: () => setNowPlayingOpen(true),
        closeNowPlaying: () => setNowPlayingOpen(false),
        playTrack,
        playNext,
        playPrev,
        addToQueue,
        playNextTrack,
        removeFromQueue,
        clearQueue,
        reorderQueue,
        toggleShuffle,
        setLoop,
        playAll,
        playAlbum,
        playPlaylist,
        addTrack,
        removeTrack,
        updateTrack,
        isCreatorMode,
        setCreatorMode,
        isCreator,
        playlists,
        playlistsLoading,
        refreshPlaylists,
        createPlaylist,
        deletePlaylist,
        renamePlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
      }}
    >
      {children}
    </MusicContext.Provider>
  )
}
