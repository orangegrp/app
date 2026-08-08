import "server-only"
import { Resend } from "resend"
import { Webhook } from "svix"

export type ResendInboundAttachment = {
  fileName: string
  mimeType: string
  contentId: string | null
  isInline: boolean
  data: ArrayBuffer
}

export type ResendInboundMessage = {
  inboundMessageId: string
  subject: string
  from: string
  to: string[]
  cc: string[]
  bcc: string[]
  text: string | null
  html: string | null
  receivedAt: string | null
  attachments: ResendInboundAttachment[]
}

function getResendApiKey(): string {
  const key = process.env.RESEND_API_KEY ?? ""
  if (!key) throw new Error("Missing RESEND_API_KEY")
  return key
}

function getWebhookSecret(): string {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? ""
  if (!secret) throw new Error("Missing RESEND_WEBHOOK_SECRET")
  return secret
}

function getClient(): Resend {
  return new Resend(getResendApiKey())
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function parseInboundAttachments(rawAttachments: unknown): ResendInboundAttachment[] {
  if (!Array.isArray(rawAttachments)) return []

  return rawAttachments
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const row = item as Record<string, unknown>
      const fileName =
        typeof row.filename === "string"
          ? row.filename
          : typeof row.name === "string"
            ? row.name
            : "attachment"
      const mimeType =
        typeof row.content_type === "string"
          ? row.content_type
          : typeof row.mime_type === "string"
            ? row.mime_type
            : "application/octet-stream"
      const contentId = typeof row.content_id === "string" ? row.content_id : null
      const isInline = Boolean(row.inline)

      const base64Content =
        typeof row.content === "string"
          ? row.content
          : typeof row.base64 === "string"
            ? row.base64
            : null
      if (!base64Content) return null

      const data = Buffer.from(base64Content, "base64")
      return {
        fileName,
        mimeType,
        contentId,
        isInline,
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      } satisfies ResendInboundAttachment
    })
    .filter((item): item is ResendInboundAttachment => item !== null)
}

export function verifyResendWebhookOrThrow(params: {
  rawBody: string
  headers: Headers
}): Record<string, unknown> {
  const svixId = params.headers.get("svix-id")
  const svixTimestamp = params.headers.get("svix-timestamp")
  const svixSignature = params.headers.get("svix-signature")

  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error("Missing webhook signature headers")
  }

  const webhook = new Webhook(getWebhookSecret())
  const verified = webhook.verify(params.rawBody, {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": svixSignature,
  })

  if (!verified || typeof verified !== "object") {
    throw new Error("Invalid webhook payload")
  }

  return verified as Record<string, unknown>
}

export function extractResendWebhookMeta(payload: Record<string, unknown>): {
  eventId: string | null
  eventType: string | null
  inboundMessageId: string | null
  messageId: string | null
  data: Record<string, unknown> | null
} {
  const eventId = typeof payload.id === "string" ? payload.id : null
  const eventType = typeof payload.type === "string" ? payload.type : null
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : null

  const inboundMessageId =
    data && typeof data.email_id === "string"
      ? data.email_id
      : data && typeof data.id === "string"
        ? data.id
        : null

  const messageId =
    data && typeof data.email_id === "string"
      ? data.email_id
      : data && typeof data.message_id === "string"
        ? data.message_id
        : data && typeof data.id === "string"
          ? data.id
          : null

  return {
    eventId,
    eventType,
    inboundMessageId,
    messageId,
    data,
  }
}

export async function fetchInboundMessageFromResend(
  inboundMessageId: string
): Promise<ResendInboundMessage> {
  const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(inboundMessageId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${getResendApiKey()}`,
      },
      cache: "no-store",
    }
  )

  if (!res.ok) {
    throw new Error(`Failed to fetch inbound message from Resend (${res.status})`)
  }

  const json = (await res.json()) as Record<string, unknown>
  const message =
    json.data && typeof json.data === "object"
      ? (json.data as Record<string, unknown>)
      : json

  const attachments = parseInboundAttachments(message.attachments)

  return {
    inboundMessageId,
    subject: typeof message.subject === "string" ? message.subject : "",
    from: typeof message.from === "string" ? message.from : "",
    to: asStringArray(message.to),
    cc: asStringArray(message.cc),
    bcc: asStringArray(message.bcc),
    text: typeof message.text === "string" ? message.text : null,
    html: typeof message.html === "string" ? message.html : null,
    receivedAt:
      typeof message.created_at === "string" ? message.created_at : null,
    attachments,
  }
}

export async function sendOutboundEmail(params: {
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text: string
  html: string | null
}): Promise<{ resendMessageId: string | null }> {
  const resend = getClient()
  const { data, error } = await resend.emails.send({
    from: params.from,
    to: params.to,
    cc: params.cc?.length ? params.cc : undefined,
    bcc: params.bcc?.length ? params.bcc : undefined,
    subject: params.subject,
    text: params.text,
    html: params.html ?? undefined,
  })

  if (error) {
    throw new Error(error.message)
  }

  return { resendMessageId: data?.id ?? null }
}
