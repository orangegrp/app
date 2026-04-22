import 'server-only'
import { signMusicPutUrl } from '@/server/lib/music-r2'

/**
 * @deprecated Storage is Cloudflare R2; kept for docs / migration reference only.
 * Logical keys in Postgres: audio/…, covers/…, lyrics/… (R2: music-tracks/ + these).
 */
export const MUSIC_TRACKS_BUCKET = 'music-tracks'

/** Stored in `audio_url` / `cover_url` / `lyrics_url` — not fetchable; APIs return presigned R2 URLs. */
export const MUSIC_ASSET_URL_PLACEHOLDER = 'https://invalid.order332.app/music-asset'

export const MUSIC_AUDIO_MAX_SIZE = 100 * 1024 * 1024 // 100 MB
export const MUSIC_COVER_MAX_SIZE = 5 * 1024 * 1024 //   5 MB
export const MUSIC_LYRICS_MAX_SIZE = 1024 * 1024 //   1 MB

export const MUSIC_AUDIO_ALLOWED_TYPES = new Set([
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac',
  'audio/aac', 'audio/mp4', 'audio/x-m4a',
])

export const MUSIC_COVER_ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
])

/** Generates a storage key without uploading. Used for signed upload URL flow. */
export function generateMusicStorageKey(
  prefix: 'audio' | 'covers' | 'lyrics',
  userId: string,
  contentType: string,
  filenameHint: string,
): string {
  const ext = extensionFromMime(contentType, filenameHint)
  const safeBase = filenameHint.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'file'
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}/${userId}/${Date.now()}-${rand}-${safeBase}.${ext}`
}

/** Presigned PUT to R2 (same logical key as stored in Postgres). */
export async function createMusicSignedUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  return signMusicPutUrl(key, contentType)
}

function extensionFromMime(mimeType: string, filenameHint: string): string {
  if (filenameHint.toLowerCase().endsWith('.lrc')) return 'lrc'
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
    'audio/flac': 'flac', 'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'text/plain': 'txt', 'application/octet-stream': 'bin',
  }
  return map[mimeType] ?? 'bin'
}
