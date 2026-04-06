import { apiGet, apiDelete, apiPatch, apiPost } from "./api-client"

export type LyricsType = "lrc" | "txt"
export type LoopMode = "none" | "track" | "all"

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

export interface MusicTrackUpdateMeta {
  title: string
  artist: string
  album?: string | null
  genre?: string | null
  coverKey?: string | null
  lyricsKey?: string | null
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
  coverUrls: string[]
}

export interface MusicPlaylistWithTracks extends Omit<
  MusicPlaylistMeta,
  "trackCount"
> {
  tracks: MusicTrackMeta[]
}

export async function fetchMusicTracks(
  genre?: string
): Promise<{ tracks: MusicTrackMeta[] }> {
  const path = genre
    ? `/music/tracks?genre=${encodeURIComponent(genre)}`
    : "/music/tracks"
  return apiGet<{ tracks: MusicTrackMeta[] }>(path)
}

export async function deleteMusicTrack(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/music/tracks/${encodeURIComponent(id)}`)
}

export async function updateMusicTrack(
  id: string,
  meta: MusicTrackUpdateMeta
): Promise<{ track: MusicTrackMeta }> {
  return apiPatch<{ track: MusicTrackMeta }>(
    `/music/tracks/${encodeURIComponent(id)}`,
    meta
  )
}

export async function uploadMusicTrackAsset(
  prefix: "covers" | "lyrics",
  file: File
): Promise<{ storageKey: string }> {
  const { urls } = await apiPost<{
    urls: Array<{ prefix: string; storageKey: string; signedUrl: string }>
  }>("/music/tracks/upload-urls", {
    files: [{ prefix, filename: file.name, contentType: file.type }],
  })
  const upload = urls.find((u) => u.prefix === prefix)
  if (!upload) throw new Error("No upload URL returned")
  await _uploadViaXhr(upload.signedUrl, file)
  return { storageKey: upload.storageKey }
}

export async function fetchTrackLyrics(
  trackId: string
): Promise<{ content: string; type: LyricsType }> {
  return apiGet<{ content: string; type: LyricsType }>(
    `/music/tracks/${encodeURIComponent(trackId)}/lyrics`
  )
}

/**
 * Uploads a music track by:
 * 1. Requesting signed upload URLs from the server
 * 2. Uploading files directly to Supabase Storage (bypasses Vercel size limits)
 * 3. Registering the track with the server using the resulting storage keys
 *
 * @param onProgress — called with 0–100 during the audio file upload
 */
export async function uploadMusicTrack(
  audio: File,
  cover: File | null,
  lyrics: File | null,
  meta: {
    title: string
    artist: string
    album?: string | null
    genre?: string | null
    durationSec: number
  },
  onProgress?: (pct: number) => void
): Promise<{ track: MusicTrackMeta }> {
  // Step 1: Request signed upload URLs
  const fileSpecs: Array<{
    prefix: "audio" | "covers" | "lyrics"
    filename: string
    contentType: string
  }> = [{ prefix: "audio", filename: audio.name, contentType: audio.type }]
  if (cover)
    fileSpecs.push({
      prefix: "covers",
      filename: cover.name,
      contentType: cover.type,
    })
  if (lyrics)
    fileSpecs.push({
      prefix: "lyrics",
      filename: lyrics.name,
      contentType: lyrics.type,
    })

  const { urls } = await apiPost<{
    urls: Array<{ prefix: string; storageKey: string; signedUrl: string }>
  }>("/music/tracks/upload-urls", { files: fileSpecs })

  const audioUpload = urls.find((u) => u.prefix === "audio")
  if (!audioUpload) throw new Error("No audio upload URL returned")
  const coverUpload = urls.find((u) => u.prefix === "covers") ?? null
  const lyricsUpload = urls.find((u) => u.prefix === "lyrics") ?? null

  // Step 2: Upload files directly to Supabase Storage via signed URLs
  await _uploadViaXhr(audioUpload.signedUrl, audio, onProgress)
  if (cover && coverUpload) await _uploadViaXhr(coverUpload.signedUrl, cover)
  if (lyrics && lyricsUpload)
    await _uploadViaXhr(lyricsUpload.signedUrl, lyrics)

  // Step 3: Register the track (server saves keys + metadata to DB)
  return apiPost<{ track: MusicTrackMeta }>("/music/tracks", {
    audioKey: audioUpload.storageKey,
    coverKey: coverUpload?.storageKey ?? null,
    lyricsKey: lyricsUpload?.storageKey ?? null,
    lyricsType: lyrics
      ? lyrics.name.toLowerCase().endsWith(".lrc")
        ? "lrc"
        : "txt"
      : null,
    title: meta.title,
    artist: meta.artist,
    album: meta.album ?? null,
    genre: meta.genre ?? null,
    durationSec: meta.durationSec,
  })
}

function _uploadViaXhr(
  signedUrl: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", signedUrl)
    xhr.setRequestHeader("Content-Type", file.type)
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage upload failed: ${xhr.status}`))
    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.send(file)
  })
}

export interface MusicShareLinkResult {
  token: string
  shareUrl: string
  expiresAt: string | null
}

export async function createMusicShareLink(
  trackId: string,
  expiresIn: "24h" | "7d" | "never"
): Promise<MusicShareLinkResult> {
  return apiPost<MusicShareLinkResult>(
    `/music/tracks/${encodeURIComponent(trackId)}/share`,
    { expiresIn }
  )
}

// ── Playlist API ──────────────────────────────────────────────────────────────

export async function fetchMusicPlaylists(): Promise<{
  playlists: MusicPlaylistMeta[]
}> {
  return apiGet<{ playlists: MusicPlaylistMeta[] }>("/music/playlists")
}

export async function fetchMusicPlaylist(
  id: string
): Promise<{ playlist: MusicPlaylistWithTracks }> {
  return apiGet<{ playlist: MusicPlaylistWithTracks }>(
    `/music/playlists/${encodeURIComponent(id)}`
  )
}

export async function createMusicPlaylist(
  name: string,
  description?: string | null
): Promise<{ playlist: MusicPlaylistMeta }> {
  return apiPost<{ playlist: MusicPlaylistMeta }>("/music/playlists", {
    name,
    description: description ?? null,
  })
}

export async function updateMusicPlaylist(
  id: string,
  data: { name?: string; description?: string | null }
): Promise<{ playlist: MusicPlaylistMeta }> {
  return apiPatch<{ playlist: MusicPlaylistMeta }>(
    `/music/playlists/${encodeURIComponent(id)}`,
    data
  )
}

export async function deleteMusicPlaylist(
  id: string
): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(
    `/music/playlists/${encodeURIComponent(id)}`
  )
}

export async function addTrackToPlaylist(
  playlistId: string,
  trackId: string
): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>(
    `/music/playlists/${encodeURIComponent(playlistId)}/tracks`,
    { trackId }
  )
}

export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string
): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(
    `/music/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`
  )
}

export async function reorderPlaylistTracks(
  playlistId: string,
  order: string[]
): Promise<{ ok: boolean }> {
  return apiPatch<{ ok: boolean }>(
    `/music/playlists/${encodeURIComponent(playlistId)}/tracks/order`,
    { order }
  )
}

/** Formats seconds as m:ss or h:mm:ss. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}
