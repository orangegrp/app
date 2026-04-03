import 'server-only'
import { supabase } from '@/server/db/supabase/client'

export const BLOG_IMAGES_BUCKET = 'blog-images'

export const BLOG_IMAGE_MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export const BLOG_IMAGE_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
])

/** Ensures the blog-images bucket exists (idempotent). */
export async function ensureBlogImagesBucket(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (buckets?.some((b) => b.id === BLOG_IMAGES_BUCKET)) return

  await supabase.storage.createBucket(BLOG_IMAGES_BUCKET, {
    public: true,
    fileSizeLimit: BLOG_IMAGE_MAX_SIZE,
    allowedMimeTypes: [...BLOG_IMAGE_ALLOWED_TYPES],
  })
}

export interface UploadBlogImageBufferParams {
  userId: string
  buffer: ArrayBuffer
  contentType: string
  /** Used for file extension only (e.g. `generated.png`). */
  filenameHint?: string
}

/**
 * Upload raw image bytes to the public blog-images bucket. Same rules as POST /blog/images.
 */
export async function uploadBlogImageBuffer({
  userId,
  buffer,
  contentType,
  filenameHint = 'image',
}: UploadBlogImageBufferParams): Promise<{ publicUrl: string }> {
  if (!BLOG_IMAGE_ALLOWED_TYPES.has(contentType)) {
    throw new Error(`Unsupported file type: ${contentType}`)
  }
  if (buffer.byteLength > BLOG_IMAGE_MAX_SIZE) {
    throw new Error('File exceeds 10 MB limit')
  }

  try {
    await ensureBlogImagesBucket()
  } catch (err) {
    console.error('[blog-image-upload] ensureBlogImagesBucket error:', err)
  }

  const ext =
    contentType === 'image/png'
      ? 'png'
      : contentType === 'image/jpeg'
        ? 'jpg'
        : contentType === 'image/gif'
          ? 'gif'
          : contentType === 'image/webp'
            ? 'webp'
            : contentType === 'image/avif'
              ? 'avif'
              : 'bin'

  const safeBase = filenameHint.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'image'
  const rand = Math.random().toString(36).slice(2, 10)
  const key = `${userId}/${Date.now()}-${rand}-${safeBase}.${ext}`

  const { error } = await supabase.storage.from(BLOG_IMAGES_BUCKET).upload(key, buffer, {
    contentType,
    upsert: false,
  })

  if (error) {
    console.error('[blog-image-upload] upload error:', error)
    throw new Error('Upload failed')
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BLOG_IMAGES_BUCKET).getPublicUrl(key)

  return { publicUrl }
}
