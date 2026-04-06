"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useAudioPlayer } from "@/components/ui/audio-player"
import {
  fetchMusicTracks,
  refreshMusicTrackSource,
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
import {
  getCachedTrackSource,
  purgeMusicCacheForUser,
  warmTrackCache,
} from "@/lib/music-cache"

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
  addTracksToQueue: (ids: string[]) => void
  addTracksAsPlayNext: (ids: string[]) => void
  skipToQueueTrack: (id: string, upNextIndex?: number) => void
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
  const playSequenceRef = useRef(0)
  const activeCachedSrcReleaseRef = useRef<(() => void) | null>(null)
  const deferredCachedSrcReleaseRef = useRef<(() => void) | null>(null)
  const deferredCachedSrcTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const prefetchAbortRef = useRef<AbortController | null>(null)
  const prefetchedTrackIdRef = useRef<string | null>(null)
  const recoveringSrcRef = useRef(false)
  const previousUserIdRef = useRef<string | null>(null)

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

  const tracksById = useMemo(() => {
    const map = new Map<string, MusicTrackMeta>()
    for (const track of tracks) map.set(track.id, track)
    return map
  }, [tracks])

  const currentTrack = currentTrackId
    ? (tracksById.get(currentTrackId) ?? null)
    : null

  // ── Native loop ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const audio = player.ref.current
    if (!audio) return
    audio.loop = loop === "track"
  }, [loop, player.ref])

  // ── Core play helper (internal) ──────────────────────────────────────────────

  const flushDeferredCachedSourceRelease = useCallback(() => {
    if (deferredCachedSrcTimerRef.current) {
      clearTimeout(deferredCachedSrcTimerRef.current)
      deferredCachedSrcTimerRef.current = null
    }
    deferredCachedSrcReleaseRef.current?.()
    deferredCachedSrcReleaseRef.current = null
  }, [])

  const releaseActiveCachedSource = useCallback(
    (deferMs = 0) => {
      const release = activeCachedSrcReleaseRef.current
      activeCachedSrcReleaseRef.current = null
      if (!release) return

      if (deferMs <= 0) {
        release()
        return
      }

      flushDeferredCachedSourceRelease()
      deferredCachedSrcReleaseRef.current = release
      deferredCachedSrcTimerRef.current = setTimeout(() => {
        deferredCachedSrcReleaseRef.current?.()
        deferredCachedSrcReleaseRef.current = null
        deferredCachedSrcTimerRef.current = null
      }, deferMs)
    },
    [flushDeferredCachedSourceRelease]
  )

  const _playById = useCallback(
    async (id: string) => {
      const track = tracksRef.current.find((t) => t.id === id)
      if (!track) return

      if (player.activeItem?.id === track.id) {
        setCurrentTrackId(id)
        try {
          await player.play()
        } catch (error) {
          console.error("[music/context] playback resume failed", error)
          return
        }

        if (user?.id) {
          void warmTrackCache({
            userId: user.id,
            trackId: track.id,
            sourceUrl: track.audioUrl,
          })
        }
        if (isMobile) setNowPlayingOpen(true)
        return
      }

      const sequence = ++playSequenceRef.current
      setCurrentTrackId(id)

      let src = track.audioUrl
      let releaseCachedSrc: (() => void) | null = null

      if (user?.id) {
        const cached = await getCachedTrackSource(user.id, track.id)
        if (sequence !== playSequenceRef.current) {
          cached?.release()
          return
        }
        if (cached) {
          src = cached.src
          releaseCachedSrc = cached.release
        }
      }

      releaseActiveCachedSource(2500)
      activeCachedSrcReleaseRef.current = releaseCachedSrc

      try {
        await player.play({ id: track.id, src, data: track })
      } catch (error) {
        releaseCachedSrc?.()
        if (src !== track.audioUrl) {
          activeCachedSrcReleaseRef.current = null
          try {
            await player.play({
              id: track.id,
              src: track.audioUrl,
              data: track,
            })
          } catch (networkError) {
            console.error("[music/context] playback failed", networkError)
            return
          }
        } else {
          console.error("[music/context] playback failed", error)
          return
        }
      }

      if (user?.id) {
        void warmTrackCache({
          userId: user.id,
          trackId: track.id,
          sourceUrl: track.audioUrl,
        })
      }

      if (isMobile) setNowPlayingOpen(true)
    },
    [isMobile, player, releaseActiveCachedSource, user?.id]
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
      void _playById(id)
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
      void _playById(nextId)
      return
    }

    const effective = shuffleRef.current
      ? shuffledQueueRef.current
      : queueRef.current
    if (effective.length === 0) return
    const idx = effective.indexOf(currentTrackIdRef.current ?? "")
    const nextIdx = idx + 1

    if (nextIdx < effective.length) {
      void _playById(effective[nextIdx])
    } else if (loopRef.current === "all") {
      void _playById(effective[0])
    }
  }, [_playById])

  const playPrev = useCallback(() => {
    const effective = shuffleRef.current
      ? shuffledQueueRef.current
      : queueRef.current
    if (effective.length === 0) return
    const idx = effective.indexOf(currentTrackIdRef.current ?? "")
    const prevIdx = idx <= 0 ? effective.length - 1 : idx - 1
    void _playById(effective[prevIdx])
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

  // ── URL expiry recovery ──────────────────────────────────────────────────────
  useEffect(() => {
    const audio = player.ref.current
    if (!audio) return
    const handle = async () => {
      const err = audio.error
      if (!err) return
      // MEDIA_ERR_NETWORK (2) or MEDIA_ERR_SRC_NOT_SUPPORTED (4) suggest expired/bad URL
      if (
        err.code !== MediaError.MEDIA_ERR_NETWORK &&
        err.code !== MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
      )
        return

      if (audio.currentSrc.startsWith("blob:")) return
      if (recoveringSrcRef.current) return

      recoveringSrcRef.current = true
      try {
        const id = currentTrackIdRef.current
        if (!id) return

        const { track } = await refreshMusicTrackSource(id)
        setTracks((prev) => prev.map((t) => (t.id === track.id ? track : t)))

        releaseActiveCachedSource(2500)

        // Replay from same position
        const resumeAt = audio.currentTime
        await player.play({ id: track.id, src: track.audioUrl, data: track })
        if (resumeAt > 0) player.seek(resumeAt)

        if (user?.id) {
          void warmTrackCache({
            userId: user.id,
            trackId: track.id,
            sourceUrl: track.audioUrl,
          })
        }
      } catch (e) {
        console.error("[music/context] URL refresh failed", e)
      } finally {
        recoveringSrcRef.current = false
      }
    }
    audio.addEventListener("error", handle)
    return () => audio.removeEventListener("error", handle)
  }, [player, player.ref, releaseActiveCachedSource, user?.id])

  useEffect(() => {
    const previousUserId = previousUserIdRef.current
    const nextUserId = user?.id ?? null

    if (previousUserId && previousUserId !== nextUserId) {
      void purgeMusicCacheForUser(previousUserId)
    }

    if (previousUserId !== nextUserId) {
      prefetchAbortRef.current?.abort()
      prefetchAbortRef.current = null
      prefetchedTrackIdRef.current = null
      flushDeferredCachedSourceRelease()
      releaseActiveCachedSource()
    }

    previousUserIdRef.current = nextUserId
  }, [flushDeferredCachedSourceRelease, releaseActiveCachedSource, user?.id])

  useEffect(() => {
    if (!user?.id || !currentTrackId) {
      prefetchAbortRef.current?.abort()
      prefetchAbortRef.current = null
      prefetchedTrackIdRef.current = null
      return
    }

    let nextTrackId: string | null = null

    if (upNext.length > 0) {
      nextTrackId = upNext[0]
    } else {
      const effective = shuffle ? shuffledQueue : queue
      if (effective.length > 0) {
        const idx = effective.indexOf(currentTrackId)
        if (idx >= 0 && idx + 1 < effective.length) {
          nextTrackId = effective[idx + 1]
        } else if (idx >= 0 && loop === "all") {
          nextTrackId = effective[0] ?? null
        }
      }
    }

    if (!nextTrackId || nextTrackId === currentTrackId) {
      prefetchAbortRef.current?.abort()
      prefetchAbortRef.current = null
      prefetchedTrackIdRef.current = null
      return
    }

    if (prefetchedTrackIdRef.current === nextTrackId) return

    const nextTrack = tracksRef.current.find((t) => t.id === nextTrackId)
    if (!nextTrack) return

    prefetchAbortRef.current?.abort()
    const controller = new AbortController()
    prefetchAbortRef.current = controller
    prefetchedTrackIdRef.current = nextTrackId

    void warmTrackCache({
      userId: user.id,
      trackId: nextTrack.id,
      sourceUrl: nextTrack.audioUrl,
      signal: controller.signal,
    }).finally(() => {
      if (prefetchAbortRef.current === controller) {
        prefetchAbortRef.current = null
      }
    })
  }, [currentTrackId, loop, queue, shuffledQueue, shuffle, upNext, user?.id])

  useEffect(() => {
    return () => {
      prefetchAbortRef.current?.abort()
      prefetchAbortRef.current = null
      flushDeferredCachedSourceRelease()
      releaseActiveCachedSource()
    }
  }, [flushDeferredCachedSourceRelease, releaseActiveCachedSource])

  // ── Queue management ─────────────────────────────────────────────────────────

  const addToQueue = useCallback((id: string) => {
    setUpNext((prev) => [...prev, id])
  }, [])

  const playNextTrack = useCallback((id: string) => {
    setUpNext((prev) => [id, ...prev])
  }, [])

  const addTracksToQueue = useCallback((ids: string[]) => {
    setUpNext((prev) => [...prev, ...ids])
  }, [])

  const addTracksAsPlayNext = useCallback((ids: string[]) => {
    setUpNext((prev) => [...ids, ...prev])
  }, [])

  const skipToQueueTrack = useCallback(
    (id: string, upNextIndex?: number) => {
      if (upNextIndex !== undefined) {
        setUpNext((prev) => prev.filter((_, i) => i !== upNextIndex))
      }
      void _playById(id)
    },
    [_playById]
  )

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
        void _playById(sh[0])
      } else {
        setShuffle(false)
        setQueue(all)
        void _playById(all[0])
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
        void _playById(sh[0])
      } else {
        setShuffle(false)
        setQueue(ids)
        void _playById(startId ?? ids[0])
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
        void _playById(sh[0])
      } else {
        setShuffle(false)
        setQueue(ids)
        void _playById(startId ?? ids[0])
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
        releaseActiveCachedSource()
        player.pause()
        setCurrentTrackId(null)
      }
    },
    [player, releaseActiveCachedSource]
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

  const contextValue = useMemo(
    () => ({
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
      addTracksToQueue,
      addTracksAsPlayNext,
      skipToQueueTrack,
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
    }),
    [
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
      playTrack,
      playNext,
      playPrev,
      addToQueue,
      playNextTrack,
      addTracksToQueue,
      addTracksAsPlayNext,
      skipToQueueTrack,
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
    ]
  )

  return (
    <MusicContext.Provider value={contextValue}>
      {children}
    </MusicContext.Provider>
  )
}
