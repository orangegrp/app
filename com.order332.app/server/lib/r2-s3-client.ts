import 'server-only'
import { S3Client } from '@aws-sdk/client-s3'

/**
 * R2 S3 connection settings (shared by WebPC disks, music, etc.).
 * Key prefixes are per feature — see R2_KEY_PREFIX, MUSIC_R2_KEY_PREFIX.
 */
export interface R2ClientConfig {
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  endpoint: string
  forcePathStyle: boolean
}

let cachedClient: S3Client | null = null
let clientCacheKey: string | null = null

/**
 * @throws {Error} R2 not configured
 */
export function resolveR2ClientConfig(): R2ClientConfig {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')
  const forcePathStyle = process.env.R2_FORCE_PATH_STYLE !== 'false'

  if (!accessKeyId || !secretAccessKey || !bucket || !accountId || !endpoint) {
    throw new Error('R2 not configured')
  }

  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    forcePathStyle,
  }
}

/**
 * Single cached S3Client for the current R2 endpoint + credentials.
 */
export function getR2S3Client(cfg: R2ClientConfig): S3Client {
  const idKey = `${cfg.endpoint}\0${cfg.forcePathStyle ? 'path' : 'vh'}\0${cfg.accessKeyId}`
  if (cachedClient && clientCacheKey === idKey) {
    return cachedClient
  }
  clientCacheKey = idKey
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    // R2: avoid checksum headers in presigned requests
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(cfg.forcePathStyle ? { forcePathStyle: true as const } : {}),
  })
  return cachedClient
}
