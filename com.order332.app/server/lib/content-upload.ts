import 'server-only'
import { supabase } from '@/server/db/supabase/client'

export const CONTENT_LIBRARY_BUCKET = 'content-library'

export type ContentItemType = 'image' | 'audio' | 'pdf' | 'download'

export const CONTENT_SIZE_LIMITS: Record<ContentItemType, number> = {
  image:     20 * 1024 * 1024,   // 20 MB
  audio:    100 * 1024 * 1024,   // 100 MB
  pdf:       50 * 1024 * 1024,   // 50 MB
  download: 100 * 1024 * 1024,   // 100 MB
}

export const CONTENT_ALLOWED_TYPES: Record<ContentItemType, Set<string>> = {
  image:    new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']),
  audio:    new Set(['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/mp4', 'audio/x-m4a']),
  pdf:      new Set(['application/pdf']),
  download: new Set(['application/zip', 'application/x-zip-compressed', 'application/octet-stream', 'text/plain', 'text/csv']),
}

/** Video MIME types — blocked with a specific error message. */
export const VIDEO_MIME_TYPES = new Set([
  'video/mp4', 'video/mpeg', 'video/webm', 'video/ogg', 'video/quicktime',
  'video/x-msvideo', 'video/x-ms-wmv', 'video/x-flv', 'video/3gpp',
])

/** All allowed MIME types across all content types (union). */
export const ALL_CONTENT_ALLOWED_TYPES: Set<string> = new Set([
  ...CONTENT_ALLOWED_TYPES.image,
  ...CONTENT_ALLOWED_TYPES.audio,
  ...CONTENT_ALLOWED_TYPES.pdf,
  ...CONTENT_ALLOWED_TYPES.download,
])

/** Derives ContentItemType from a MIME string. Returns null if not allowed. */
export function inferItemType(mimeType: string): ContentItemType | null {
  for (const [type, mimes] of Object.entries(CONTENT_ALLOWED_TYPES) as [ContentItemType, Set<string>][]) {
    if (mimes.has(mimeType)) return type
  }
  return null
}

/** Ensures the content-library bucket exists (idempotent). */
export async function ensureContentLibraryBucket(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (buckets?.some((b) => b.id === CONTENT_LIBRARY_BUCKET)) return

  await supabase.storage.createBucket(CONTENT_LIBRARY_BUCKET, {
    public: true,
    fileSizeLimit: 100 * 1024 * 1024,
    allowedMimeTypes: [...ALL_CONTENT_ALLOWED_TYPES],
  })
}

export interface UploadContentItemParams {
  userId: string
  buffer: ArrayBuffer
  contentType: string
  filenameHint?: string
}

/** Uploads raw bytes to the public content-library bucket. Returns storageKey + publicUrl. */
export async function uploadContentItemBuffer({
  userId,
  buffer,
  contentType,
  filenameHint = 'file',
}: UploadContentItemParams): Promise<{ storageKey: string; publicUrl: string }> {
  try {
    await ensureContentLibraryBucket()
  } catch (err) {
    console.error('[content-upload] ensureContentLibraryBucket error:', err)
  }

  const ext = extensionFromMime(contentType)
  const safeBase = filenameHint.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'file'
  const rand = Math.random().toString(36).slice(2, 10)
  const key = `${userId}/${Date.now()}-${rand}-${safeBase}.${ext}`

  const { error } = await supabase.storage.from(CONTENT_LIBRARY_BUCKET).upload(key, buffer, {
    contentType,
    upsert: false,
  })

  if (error) {
    console.error('[content-upload] upload error:', error)
    throw new Error('Upload failed')
  }

  const { data: { publicUrl } } = supabase.storage.from(CONTENT_LIBRARY_BUCKET).getPublicUrl(key)
  return { storageKey: key, publicUrl }
}

function extensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/avif': 'avif',
    'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
    'audio/flac': 'flac', 'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
    'application/pdf': 'pdf',
    'application/zip': 'zip', 'application/x-zip-compressed': 'zip',
    'text/plain': 'txt', 'text/csv': 'csv',
  }
  return map[mimeType] ?? 'bin'
}
