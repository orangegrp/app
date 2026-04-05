import { apiGet, apiDelete, apiPatch, apiPost } from './api-client'
import { useAuthStore } from './auth-store'

export type LyricsType = 'lrc' | 'txt'
export type LoopMode = 'none' | 'track' | 'all'

export interface MusicTrackMeta {
  id: string
  createdAt: string
  updatedAt: string
  uploadedBy: string | null
  title: string
  artist: string
  album?: string | null
  genre?: string | null
  durationSec: number
  audioUrl: string
  coverUrl?: string | null
  lyricsUrl?: string | null
  lyricsType?: LyricsType | null
}

export interface MusicPlaylistMeta {
  id: string
  createdAt: string
  updatedAt: string
  createdBy: string | null
  name: string
  description: string | null
  trackCount: number
}

export interface MusicPlaylistWithTracks extends Omit<MusicPlaylistMeta, 'trackCount'> {
  tracks: MusicTrackMeta[]
}

export async function fetchMusicTracks(genre?: string): Promise<{ tracks: MusicTrackMeta[] }> {
  const path = genre ? `/music/tracks?genre=${encodeURIComponent(genre)}` : '/music/tracks'
  return apiGet<{ tracks: MusicTrackMeta[] }>(path)
}

export async function deleteMusicTrack(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/music/tracks/${encodeURIComponent(id)}`)
}

export async function updateMusicTrack(
  id: string,
  meta: { title: string; artist: string; album?: string | null; genre?: string | null },
): Promise<{ track: MusicTrackMeta }> {
  return apiPatch<{ track: MusicTrackMeta }>(`/music/tracks/${encodeURIComponent(id)}`, meta)
}

export async function fetchTrackLyrics(trackId: string): Promise<{ content: string; type: LyricsType }> {
  return apiGet<{ content: string; type: LyricsType }>(`/music/tracks/${encodeURIComponent(trackId)}/lyrics`)
}

/**
 * Uploads a music track with all associated files.
 * Uses XMLHttpRequest for upload progress support.
 * @param onProgress — called with 0–100 as bytes are sent
 */
export async function uploadMusicTrack(
  audio: File,
  cover: File | null,
  lyrics: File | null,
  meta: { title: string; artist: string; genre?: string; durationSec: number },
  onProgress?: (pct: number) => void,
): Promise<{ track: MusicTrackMeta }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('audio', audio)
    if (cover) formData.append('cover', cover)
    if (lyrics) formData.append('lyrics', lyrics)
    formData.append('title', meta.title)
    formData.append('artist', meta.artist)
    if (meta.genre) formData.append('genre', meta.genre)
    formData.append('duration_sec', String(meta.durationSec))

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/music/tracks')

    const accessToken = useAuthStore.getState().accessToken
    if (accessToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    }

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText) as { track: MusicTrackMeta })
        } catch {
          reject(new Error('Invalid response'))
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText) as { error?: string }
          reject(new Error(err.error ?? 'Upload failed'))
        } catch {
          reject(new Error('Upload failed'))
        }
      }
    }

    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(formData)
  })
}

export interface MusicShareLinkResult {
  token: string
  shareUrl: string
  expiresAt: string | null
}

export async function createMusicShareLink(
  trackId: string,
  expiresIn: '24h' | '7d' | 'never',
): Promise<MusicShareLinkResult> {
  return apiPost<MusicShareLinkResult>(
    `/music/tracks/${encodeURIComponent(trackId)}/share`,
    { expiresIn },
  )
}

// ── Playlist API ──────────────────────────────────────────────────────────────

export async function fetchMusicPlaylists(): Promise<{ playlists: MusicPlaylistMeta[] }> {
  return apiGet<{ playlists: MusicPlaylistMeta[] }>('/music/playlists')
}

export async function fetchMusicPlaylist(id: string): Promise<{ playlist: MusicPlaylistWithTracks }> {
  return apiGet<{ playlist: MusicPlaylistWithTracks }>(`/music/playlists/${encodeURIComponent(id)}`)
}

export async function createMusicPlaylist(
  name: string,
  description?: string | null,
): Promise<{ playlist: MusicPlaylistMeta }> {
  return apiPost<{ playlist: MusicPlaylistMeta }>('/music/playlists', { name, description: description ?? null })
}

export async function updateMusicPlaylist(
  id: string,
  data: { name?: string; description?: string | null },
): Promise<{ playlist: MusicPlaylistMeta }> {
  return apiPatch<{ playlist: MusicPlaylistMeta }>(`/music/playlists/${encodeURIComponent(id)}`, data)
}

export async function deleteMusicPlaylist(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/music/playlists/${encodeURIComponent(id)}`)
}

export async function addTrackToPlaylist(playlistId: string, trackId: string): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>(
    `/music/playlists/${encodeURIComponent(playlistId)}/tracks`,
    { trackId },
  )
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(
    `/music/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`,
  )
}

/** Formats seconds as m:ss or h:mm:ss. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
