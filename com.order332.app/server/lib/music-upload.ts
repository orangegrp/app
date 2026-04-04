import 'server-only'
import { supabase } from '@/server/db/supabase/client'

export const MUSIC_TRACKS_BUCKET = 'music-tracks'

export const MUSIC_AUDIO_MAX_SIZE  = 100 * 1024 * 1024  // 100 MB
export const MUSIC_COVER_MAX_SIZE  =   5 * 1024 * 1024  //   5 MB
export const MUSIC_LYRICS_MAX_SIZE =       1024 * 1024  //   1 MB

export const MUSIC_AUDIO_ALLOWED_TYPES = new Set([
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac',
  'audio/aac', 'audio/mp4', 'audio/x-m4a',
])

export const MUSIC_COVER_ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
])

const ALL_MUSIC_ALLOWED_TYPES = new Set([
  ...MUSIC_AUDIO_ALLOWED_TYPES,
  ...MUSIC_COVER_ALLOWED_TYPES,
  'text/plain',
  'application/octet-stream',  // .lrc files sometimes use this
])

/** Ensures the music-tracks bucket exists (idempotent). */
export async function ensureMusicTracksBucket(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (buckets?.some((b) => b.id === MUSIC_TRACKS_BUCKET)) return

  await supabase.storage.createBucket(MUSIC_TRACKS_BUCKET, {
    public: true,
    fileSizeLimit: 100 * 1024 * 1024,
    allowedMimeTypes: [...ALL_MUSIC_ALLOWED_TYPES],
  })
}

export interface MusicUploadParams {
  userId: string
  buffer: ArrayBuffer
  contentType: string
  filenameHint?: string
}

/** Uploads audio file to music-tracks/audio/{userId}/... */
export async function uploadMusicAudio({
  userId, buffer, contentType, filenameHint = 'track',
}: MusicUploadParams): Promise<{ storageKey: string; publicUrl: string }> {
  return uploadToMusicBucket({ userId, buffer, contentType, filenameHint, prefix: 'audio' })
}

/** Uploads cover art to music-tracks/covers/{userId}/... */
export async function uploadMusicCover({
  userId, buffer, contentType, filenameHint = 'cover',
}: MusicUploadParams): Promise<{ storageKey: string; publicUrl: string }> {
  return uploadToMusicBucket({ userId, buffer, contentType, filenameHint, prefix: 'covers' })
}

/** Uploads lyrics (LRC or TXT) to music-tracks/lyrics/{userId}/... */
export async function uploadMusicLyrics({
  userId, buffer, contentType, filenameHint = 'lyrics',
}: MusicUploadParams): Promise<{ storageKey: string; publicUrl: string }> {
  return uploadToMusicBucket({ userId, buffer, contentType, filenameHint, prefix: 'lyrics' })
}

async function uploadToMusicBucket({
  userId, buffer, contentType, filenameHint, prefix,
}: MusicUploadParams & { prefix: string }): Promise<{ storageKey: string; publicUrl: string }> {
  try {
    await ensureMusicTracksBucket()
  } catch (err) {
    console.error('[music-upload] ensureMusicTracksBucket error:', err)
  }

  const ext = extensionFromMime(contentType, filenameHint ?? '')
  const safeBase = (filenameHint ?? 'file').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'file'
  const rand = Math.random().toString(36).slice(2, 10)
  const key = `${prefix}/${userId}/${Date.now()}-${rand}-${safeBase}.${ext}`

  const { error } = await supabase.storage.from(MUSIC_TRACKS_BUCKET).upload(key, buffer, {
    contentType,
    upsert: false,
  })

  if (error) {
    console.error(`[music-upload] ${prefix} upload error:`, error)
    throw new Error('Upload failed')
  }

  const { data: { publicUrl } } = supabase.storage.from(MUSIC_TRACKS_BUCKET).getPublicUrl(key)
  return { storageKey: key, publicUrl }
}

function extensionFromMime(mimeType: string, filenameHint: string): string {
  // For LRC files — the MIME may be text/plain but the extension matters
  if (filenameHint.toLowerCase().endsWith('.lrc')) return 'lrc'
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
    'audio/flac': 'flac', 'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'text/plain': 'txt', 'application/octet-stream': 'bin',
  }
  return map[mimeType] ?? 'bin'
}
