import 'server-only'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getR2S3Client, resolveR2ClientConfig } from '@/server/lib/r2-s3-client'

const DEFAULT_MUSIC_PREFIX = 'music-tracks/'

function musicKeyPrefix(): string {
  return (process.env.MUSIC_R2_KEY_PREFIX ?? DEFAULT_MUSIC_PREFIX).replace(
    /\/?$/,
    '/',
  )
}

/**
 * Full R2 object key: `{music-tracks/}{logicalKey}` where logicalKey is the DB
 * value (e.g. `audio/userId/...`).
 */
export function toMusicObjectKey(logicalKey: string): string {
  const p = musicKeyPrefix()
  const k = logicalKey.replace(/^\//, '')
  return `${p}${k}`
}

const DEFAULT_PRESIGN_SECONDS = 3600

/**
 * Presigned GET for one logical key. Returns empty string on failure.
 */
export async function signMusicGetUrl(
  logicalKey: string,
  expiresIn = DEFAULT_PRESIGN_SECONDS,
): Promise<string> {
  const m = await signMusicGetUrls([logicalKey], expiresIn)
  return m.get(logicalKey) ?? ''
}

/**
 * Presigned GET URLs keyed by the same logical keys stored in Postgres.
 * Failed keys are omitted from the map.
 */
export async function signMusicGetUrls(
  logicalKeys: string[],
  expiresIn = DEFAULT_PRESIGN_SECONDS,
): Promise<Map<string, string>> {
  if (logicalKeys.length === 0) return new Map()
  const unique = [...new Set(logicalKeys)]
  const cfg = resolveR2ClientConfig()
  const client = getR2S3Client(cfg)
  const out = new Map<string, string>()

  await Promise.all(
    unique.map(async (logicalKey) => {
      const Key = toMusicObjectKey(logicalKey)
      try {
        const url = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: cfg.bucket, Key }),
          { expiresIn },
        )
        out.set(logicalKey, url)
      } catch (err) {
        console.error(`[music-r2] sign GET failed for ${logicalKey}:`, err)
      }
    }),
  )
  return out
}

/**
 * Presigned PUT for direct browser upload. Content-Type must match the upload request.
 */
export async function signMusicPutUrl(
  logicalKey: string,
  contentType: string,
  expiresIn = DEFAULT_PRESIGN_SECONDS,
): Promise<string> {
  const cfg = resolveR2ClientConfig()
  const client = getR2S3Client(cfg)
  const Key = toMusicObjectKey(logicalKey)
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key,
      ContentType: contentType,
    }),
    { expiresIn },
  )
}

/**
 * Best-effort delete; logs errors, does not throw.
 */
export async function deleteMusicObjects(
  logicalKeys: string[],
): Promise<void> {
  if (logicalKeys.length === 0) return
  const cfg = resolveR2ClientConfig()
  const client = getR2S3Client(cfg)
  for (const logicalKey of logicalKeys) {
    if (!logicalKey) continue
    const Key = toMusicObjectKey(logicalKey)
    try {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key }))
    } catch (err) {
      console.error(`[music-r2] delete failed for ${logicalKey}:`, err)
    }
  }
}

/**
 * Read small text objects (lyrics) from R2.
 */
export async function getMusicObjectText(logicalKey: string): Promise<string> {
  const cfg = resolveR2ClientConfig()
  const client = getR2S3Client(cfg)
  const Key = toMusicObjectKey(logicalKey)
  const res = await client.send(
    new GetObjectCommand({ Bucket: cfg.bucket, Key }),
  )
  const body = res.Body
  if (!body) return ''
  const text = await body.transformToString()
  return text
}
