import "server-only"
import { randomUUID } from "crypto"
import { supabase } from "@/server/db/supabase/client"

export const MAIL_ATTACHMENTS_BUCKET = "mail-attachments"

export async function ensureMailAttachmentsBucket(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (buckets?.some((b) => b.id === MAIL_ATTACHMENTS_BUCKET)) return

  const { error } = await supabase.storage.createBucket(MAIL_ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: 25 * 1024 * 1024,
  })

  if (error && !error.message.toLowerCase().includes("already exists")) {
    throw error
  }
}

export async function saveMailAttachment(params: {
  ownerUserId: string
  messageId: string
  fileName: string
  mimeType: string
  data: ArrayBuffer
}): Promise<{ storageKey: string; sizeBytes: number }> {
  await ensureMailAttachmentsBucket()

  const safeName =
    params.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "attachment"
  const key = `${params.ownerUserId}/${params.messageId}/${randomUUID()}-${safeName}`
  const { error } = await supabase.storage
    .from(MAIL_ATTACHMENTS_BUCKET)
    .upload(key, params.data, {
      contentType: params.mimeType,
      upsert: false,
    })

  if (error) {
    throw new Error(`Failed to store attachment: ${error.message}`)
  }

  return {
    storageKey: key,
    sizeBytes: params.data.byteLength,
  }
}

export async function signMailAttachmentUrl(
  storageKey: string,
  expiresIn = 60
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(MAIL_ATTACHMENTS_BUCKET)
    .createSignedUrl(storageKey, expiresIn)

  if (error || !data?.signedUrl) {
    throw new Error("Failed to sign mail attachment URL")
  }

  return data.signedUrl
}
