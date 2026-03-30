import 'server-only'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { buildWebpcDiskObjectKey, type MachineId } from '@/lib/webpc-disks'

const PRESIGN_EXPIRES_SECONDS = 3600

export interface R2DiskPresignResult {
  url: string
  expiresIn: number
}

interface ResolvedR2Config {
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  keyPrefix: string
  endpoint: string
  forcePathStyle: boolean
}

function resolveR2Config(): ResolvedR2Config {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME
  const keyPrefix = (process.env.R2_KEY_PREFIX ?? 'webpc-images/').replace(/\/?$/, '/')
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  // R2_ENDPOINT allows overriding the S3 API base URL (e.g. for jurisdiction-specific endpoints
  // like https://<account>.eu.r2.cloudflarestorage.com). Presigned URLs must use the S3 API
  // hostname — custom domains cannot be used for presigning.
  // See: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
  const endpoint = process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')
  // Default path-style: https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<bucket>/<key>.
  // Set R2_FORCE_PATH_STYLE=false to use virtual-hosted URLs if needed.
  const forcePathStyle = process.env.R2_FORCE_PATH_STYLE !== 'false'

  if (!accessKeyId || !secretAccessKey || !bucket || !accountId || !endpoint) {
    throw new Error('R2 not configured')
  }

  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    keyPrefix,
    endpoint,
    forcePathStyle,
  }
}

let cachedClient: S3Client | null = null
let clientCacheKey: string | null = null

function getS3Client(cfg: ResolvedR2Config): S3Client {
  const key = `${cfg.endpoint}\0${cfg.forcePathStyle ? 'path' : 'vh'}\0${cfg.accessKeyId}`
  if (cachedClient && clientCacheKey === key) {
    return cachedClient
  }
  clientCacheKey = key
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    // Disable automatic checksum injection (AWS SDK v3 flexible checksums).
    // R2 does not support x-amz-checksum-mode in presigned URLs and will reject
    // the signature if these headers are included in the signed canonical request.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(cfg.forcePathStyle ? { forcePathStyle: true as const } : {}),
  })
  return cachedClient
}

/**
 * Mint a short-lived presigned GET URL for the VM disk image in R2.
 * @throws If env is incomplete or signing fails.
 */
export async function presignWebpcDiskRead(machineId: MachineId): Promise<R2DiskPresignResult> {
  const cfg = resolveR2Config()
  const key = buildWebpcDiskObjectKey(machineId, cfg.keyPrefix)
  const client = getS3Client(cfg)
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS },
  )
  return { url, expiresIn: PRESIGN_EXPIRES_SECONDS }
}
