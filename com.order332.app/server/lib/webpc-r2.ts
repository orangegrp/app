import 'server-only'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { buildWebpcDiskObjectKey, type MachineId } from '@/lib/webpc-disks'
import { getR2S3Client, resolveR2ClientConfig } from '@/server/lib/r2-s3-client'

const PRESIGN_EXPIRES_SECONDS = 3600

export interface R2DiskPresignResult {
  url: string
  expiresIn: number
}

/**
 * Mint a short-lived presigned GET URL for the VM disk image in R2.
 * @throws If env is incomplete or signing fails.
 */
export async function presignWebpcDiskRead(machineId: MachineId): Promise<R2DiskPresignResult> {
  const cfg = resolveR2ClientConfig()
  const keyPrefix = (process.env.R2_KEY_PREFIX ?? 'webpc-images/').replace(/\/?$/, '/')
  const key = buildWebpcDiskObjectKey(machineId, keyPrefix)
  const client = getR2S3Client(cfg)
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS },
  )
  return { url, expiresIn: PRESIGN_EXPIRES_SECONDS }
}
