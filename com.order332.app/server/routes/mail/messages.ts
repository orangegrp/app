import "server-only"
import { Hono } from "hono"
import { requireAuth } from "@/server/middleware/auth"
import { requirePermission } from "@/server/middleware/rbac"
import { PERMISSIONS } from "@/lib/permissions"
import { supabase } from "@/server/db/supabase/client"
import {
  createMailAttachmentProxyToken,
  createMailExternalImageProxyToken,
} from "@/server/lib/mail-proxy-token"
import {
  fetchInboundMessageFromResend,
  extractResendWebhookMeta,
  sendOutboundEmail,
  verifyResendWebhookOrThrow,
} from "@/server/lib/mail-resend"
import { sanitizeMailHtml } from "@/server/lib/mail-html"
import {
  saveMailAttachment,
  signMailAttachmentUrl,
} from "@/server/lib/mail-storage"
import type { HonoEnv } from "@/server/lib/types"

type MailboxRow = {
  id: string
  owner_user_id: string
  primary_email: string
  is_active: boolean
}

type MailMessageRow = {
  id: string
  owner_user_id: string
  direction: "inbound" | "outbound"
  folder: "inbox" | "sent"
  subject: string
  from_address: string
  to_addresses: unknown
  cc_addresses: unknown
  bcc_addresses: unknown
  snippet: string | null
  body_text: string | null
  body_html: string | null
  received_at: string | null
  sent_at: string | null
  is_read: boolean
  has_attachments: boolean
  delivery_status: string | null
  last_delivery_event_at: string | null
  last_delivery_event_type: string | null
  last_delivery_error: string | null
  complained_at: string | null
  suppressed_at: string | null
  open_count: number | null
  click_count: number | null
  created_at: string
}

type MailAttachmentRow = {
  id: string
  owner_user_id: string
  message_id: string
  file_name: string
  mime_type: string
  size_bytes: number
  content_id: string | null
  is_inline: boolean
  storage_key: string
}

function parseAddresses(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function toSnippet(text: string | null, html: string | null): string {
  const source = text ?? (html ? html.replace(/<[^>]+>/g, " ") : "")
  return source.replace(/\s+/g, " ").trim().slice(0, 280)
}

function sanitizeExternalImageUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function rewriteInlineImages(ownerUserId: string, html: string | null): string | null {
  if (!html) return null
  return html.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (match, src) => {
    if (typeof src !== "string") return match
    if (src.startsWith("cid:")) return match
    const safe = sanitizeExternalImageUrl(src)
    if (!safe) return match
    const token = createMailExternalImageProxyToken({
      userId: ownerUserId,
      url: safe,
      ttlSeconds: 60 * 5,
    })
    return match.replace(src, `/mail/image?token=${encodeURIComponent(token)}`)
  })
}

async function getMailboxForUser(userId: string): Promise<MailboxRow | null> {
  const { data, error } = await supabase
    .from("mailboxes")
    .select("id, owner_user_id, primary_email, is_active")
    .eq("owner_user_id", userId)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    throw new Error("Failed to resolve mailbox")
  }

  if (!data) return null
  return data as MailboxRow
}

async function requireMailboxForUser(userId: string): Promise<MailboxRow> {
  const mailbox = await getMailboxForUser(userId)
  if (!mailbox) {
    throw new Error("No active mailbox configured")
  }
  return mailbox
}

async function ensureDemoMailboxForUser(userId: string): Promise<MailboxRow> {
  const existing = await getMailboxForUser(userId)
  if (existing) return existing

  const demoEmail = `demo+${userId.slice(0, 8)}@example.local`
  const { data, error } = await supabase
    .from("mailboxes")
    .insert({
      owner_user_id: userId,
      primary_email: demoEmail,
      display_name: "Demo mailbox",
      is_active: true,
    })
    .select("id, owner_user_id, primary_email, is_active")
    .single()

  if (error || !data) {
    throw new Error("Failed to create demo mailbox")
  }

  return data as MailboxRow
}

function mapMessageRow(row: MailMessageRow): {
  id: string
  direction: "inbound" | "outbound"
  folder: "inbox" | "sent"
  subject: string
  fromAddress: string
  toAddresses: string[]
  ccAddresses: string[]
  bccAddresses: string[]
  snippet: string
  receivedAt: string | null
  sentAt: string | null
  isRead: boolean
  hasAttachments: boolean
  deliveryStatus: string
  lastDeliveryEventAt: string | null
  lastDeliveryEventType: string | null
  lastDeliveryError: string | null
  complainedAt: string | null
  suppressedAt: string | null
  openCount: number
  clickCount: number
  createdAt: string
} {
  return {
    id: row.id,
    direction: row.direction,
    folder: row.folder,
    subject: row.subject,
    fromAddress: row.from_address,
    toAddresses: parseAddresses(row.to_addresses),
    ccAddresses: parseAddresses(row.cc_addresses),
    bccAddresses: parseAddresses(row.bcc_addresses),
    snippet: row.snippet ?? "",
    receivedAt: row.received_at,
    sentAt: row.sent_at,
    isRead: row.is_read,
    hasAttachments: row.has_attachments,
    deliveryStatus: row.delivery_status ?? "pending",
    lastDeliveryEventAt: row.last_delivery_event_at,
    lastDeliveryEventType: row.last_delivery_event_type,
    lastDeliveryError: row.last_delivery_error,
    complainedAt: row.complained_at,
    suppressedAt: row.suppressed_at,
    openCount: row.open_count ?? 0,
    clickCount: row.click_count ?? 0,
    createdAt: row.created_at,
  }
}

async function getMessageAttachments(messageId: string): Promise<MailAttachmentRow[]> {
  const { data, error } = await supabase
    .from("mail_attachments")
    .select(
      "id, owner_user_id, message_id, file_name, mime_type, size_bytes, content_id, is_inline, storage_key"
    )
    .eq("message_id", messageId)
    .order("created_at", { ascending: true })

  if (error) throw new Error("Failed to fetch attachments")
  return (data ?? []) as MailAttachmentRow[]
}

export const mailRoutes = new Hono<HonoEnv>()
mailRoutes.use("*", requireAuth, requirePermission(PERMISSIONS.APP_MAIL))

mailRoutes.get("/messages", async (c) => {
  const user = c.get("user")
  const folder = c.req.query("folder") === "sent" ? "sent" : "inbox"

  const { data, error } = await supabase
    .from("mail_messages")
    .select(
      "id, owner_user_id, direction, folder, subject, from_address, to_addresses, cc_addresses, bcc_addresses, snippet, body_text, body_html, received_at, sent_at, is_read, has_attachments, created_at"
    )
    .eq("owner_user_id", user.id)
    .eq("folder", folder)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("[mail/messages] list error", error)
    return c.json({ error: "Failed to fetch messages" }, 500)
  }

  const messages = ((data ?? []) as MailMessageRow[]).map(mapMessageRow)
  return c.json({ messages })
})

mailRoutes.get("/messages/:id", async (c) => {
  const user = c.get("user")
  const messageId = c.req.param("id")

  const { data, error } = await supabase
    .from("mail_messages")
    .select(
      "id, owner_user_id, direction, folder, subject, from_address, to_addresses, cc_addresses, bcc_addresses, snippet, body_text, body_html, received_at, sent_at, is_read, has_attachments, created_at"
    )
    .eq("id", messageId)
    .eq("owner_user_id", user.id)
    .maybeSingle()

  if (error) {
    console.error("[mail/messages] detail error", error)
    return c.json({ error: "Failed to fetch message" }, 500)
  }

  if (!data) return c.json({ error: "Not found" }, 404)

  const row = data as MailMessageRow
  const attachments = await getMessageAttachments(row.id)
  const mappedAttachments = await Promise.all(
    attachments.map(async (attachment) => {
      const imageProxyToken = attachment.mime_type.startsWith("image/")
        ? createMailAttachmentProxyToken({
            userId: user.id,
            attachmentId: attachment.id,
            ttlSeconds: 60 * 5,
          })
        : null
      const signedDownloadUrl = await signMailAttachmentUrl(
        attachment.storage_key,
        60
      )
      return {
        id: attachment.id,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
        sizeBytes: attachment.size_bytes,
        isInline: attachment.is_inline,
        contentId: attachment.content_id,
        imageProxyUrl: imageProxyToken
          ? `/mail/image?token=${encodeURIComponent(imageProxyToken)}`
          : null,
        signedDownloadUrl,
      }
    })
  )

  const sanitizedHtml = sanitizeMailHtml(row.body_html)
  const bodyHtml = rewriteInlineImages(user.id, sanitizedHtml)

  return c.json({
    message: {
      ...mapMessageRow(row),
      bodyText: row.body_text,
      bodyHtml,
      attachments: mappedAttachments,
    },
  })
})

mailRoutes.post("/messages/:id/read", async (c) => {
  const user = c.get("user")
  const messageId = c.req.param("id")
  const body = await c.req.json().catch(() => null)
  const isRead = Boolean(
    body && typeof body === "object" && (body as { isRead?: unknown }).isRead
  )

  const { error } = await supabase
    .from("mail_messages")
    .update({ is_read: isRead, updated_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("owner_user_id", user.id)

  if (error) {
    console.error("[mail/messages] read update error", error)
    return c.json({ error: "Failed to update message" }, 500)
  }

  return c.json({ ok: true })
})

mailRoutes.delete("/messages/:id", async (c) => {
  const user = c.get("user")
  const messageId = c.req.param("id")

  const { error } = await supabase
    .from("mail_messages")
    .delete()
    .eq("id", messageId)
    .eq("owner_user_id", user.id)

  if (error) {
    console.error("[mail/messages] delete error", error)
    return c.json({ error: "Failed to delete message" }, 500)
  }

  return c.json({ ok: true })
})

mailRoutes.post("/messages/bulk-action", async (c) => {
  const user = c.get("user")
  const body = await c.req.json().catch(() => null)
  const ids: string[] = Array.isArray(body?.ids)
    ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string")
    : []
  const action: unknown = body?.action

  if (ids.length === 0) return c.json({ error: "No message IDs provided" }, 400)

  if (action === "delete") {
    const { error } = await supabase
      .from("mail_messages")
      .delete()
      .in("id", ids)
      .eq("owner_user_id", user.id)
    if (error) return c.json({ error: "Failed to delete messages" }, 500)
    return c.json({ ok: true })
  }

  if (action === "mark_read" || action === "mark_unread") {
    const isRead = action === "mark_read"
    const { error } = await supabase
      .from("mail_messages")
      .update({ is_read: isRead, updated_at: new Date().toISOString() })
      .in("id", ids)
      .eq("owner_user_id", user.id)
    if (error) return c.json({ error: "Failed to update messages" }, 500)
    return c.json({ ok: true })
  }

  return c.json({ error: "Unknown action" }, 400)
})

mailRoutes.post("/send", async (c) => {
  const user = c.get("user")

  const body = (await c.req.json().catch(() => null)) as
    | {
        to?: unknown
        cc?: unknown
        bcc?: unknown
        subject?: unknown
        text?: unknown
        html?: unknown
        demo?: unknown
      }
    | null

  const recipients = Array.isArray(body?.to)
    ? body.to.filter((item): item is string => typeof item === "string")
    : []
  const ccRecipients = Array.isArray(body?.cc)
    ? body.cc.filter((item): item is string => typeof item === "string")
    : []
  const bccRecipients = Array.isArray(body?.bcc)
    ? body.bcc.filter((item): item is string => typeof item === "string")
    : []
  const subject = typeof body?.subject === "string" ? body.subject.trim() : ""
  const text = typeof body?.text === "string" ? body.text : ""
  const html = typeof body?.html === "string" ? body.html : null
  const demo = body?.demo === true
  const demoModeEnabled = process.env.MAIL_DEMO_MODE === "true"

  if (demo && !demoModeEnabled) {
    return c.json({ error: "Demo mode is disabled" }, 403)
  }

  if (!recipients.length) return c.json({ error: "Missing recipients" }, 400)
  if (!subject) return c.json({ error: "Missing subject" }, 400)
  if (!text && !html) return c.json({ error: "Missing body" }, 400)

  let mailbox: MailboxRow
  try {
    mailbox = demo
      ? await ensureDemoMailboxForUser(user.id)
      : await requireMailboxForUser(user.id)
  } catch (error) {
    return c.json({ error: (error as Error).message }, 403)
  }

  let resendMessageId: string | null
  if (demo) {
    resendMessageId = `demo-${Date.now()}`
  } else {
    try {
      const sent = await sendOutboundEmail({
        from: mailbox.primary_email,
        to: recipients,
        cc: ccRecipients.length ? ccRecipients : undefined,
        bcc: bccRecipients.length ? bccRecipients : undefined,
        subject,
        text: text || (html ?? ""),
        html,
      })
      resendMessageId = sent.resendMessageId
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to send email",
        },
        502
      )
    }
  }

  const nowIso = new Date().toISOString()
  const snippet = toSnippet(text || null, html)
  const { data, error } = await supabase
    .from("mail_messages")
    .insert({
      owner_user_id: user.id,
      mailbox_id: mailbox.id,
      direction: "outbound",
      folder: "sent",
      resend_message_id: resendMessageId,
      subject,
      from_address: mailbox.primary_email,
      to_addresses: recipients,
      cc_addresses: [],
      bcc_addresses: [],
      body_text: text || null,
      body_html: html,
      snippet,
      sent_at: nowIso,
      is_read: true,
      has_attachments: false,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select(
      "id, owner_user_id, direction, folder, subject, from_address, to_addresses, cc_addresses, bcc_addresses, snippet, body_text, body_html, received_at, sent_at, is_read, has_attachments, created_at"
    )
    .single()

  if (error) {
    console.error("[mail/send] store error", error)
    return c.json({ error: "Sent email but failed to save" }, 500)
  }

  return c.json({ message: mapMessageRow(data as MailMessageRow) })
})

export const mailWebhookRoutes = new Hono<HonoEnv>()

type MailDeliveryStatus =
  | "pending"
  | "scheduled"
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "failed"
  | "bounced"
  | "suppressed"

type ResendTrackedEventType =
  | "email.bounced"
  | "email.clicked"
  | "email.complained"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.failed"
  | "email.opened"
  | "email.received"
  | "email.scheduled"
  | "email.sent"
  | "email.suppressed"

const TRACKED_WEBHOOK_EVENTS = new Set<ResendTrackedEventType>([
  "email.bounced",
  "email.clicked",
  "email.complained",
  "email.delivered",
  "email.delivery_delayed",
  "email.failed",
  "email.opened",
  "email.received",
  "email.scheduled",
  "email.sent",
  "email.suppressed",
])

type MailMessageLookup = {
  id: string
  owner_user_id: string
}

function getDataString(
  data: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!data) return null
  for (const key of keys) {
    const value = data[key]
    if (typeof value === "string" && value.trim().length > 0) {
      return value
    }
  }
  return null
}

function getDataNumber(
  data: Record<string, unknown> | null,
  keys: string[]
): number | null {
  if (!data) return null
  for (const key of keys) {
    const value = data[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return null
}

function getDataDateIso(
  data: Record<string, unknown> | null,
  keys: string[]
): string {
  const raw = getDataString(data, keys)
  if (!raw) return new Date().toISOString()
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

async function findMessageByResendMessageId(
  resendMessageId: string | null
): Promise<MailMessageLookup | null> {
  if (!resendMessageId) return null
  const { data, error } = await supabase
    .from("mail_messages")
    .select("id, owner_user_id")
    .eq("resend_message_id", resendMessageId)
    .eq("direction", "outbound")
    .maybeSingle()

  if (error) {
    console.error("[mail/webhook] message lookup error", error)
    return null
  }

  if (!data) return null
  return data as MailMessageLookup
}

async function appendMessageEvent(params: {
  ownerUserId: string
  messageId: string
  resendMessageId: string | null
  eventType: ResendTrackedEventType
  eventAt: string
  webhookEventId: string
  recipient?: string | null
  url?: string | null
  userAgent?: string | null
  ipAddress?: string | null
  details?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from("mail_message_events").insert({
    owner_user_id: params.ownerUserId,
    message_id: params.messageId,
    resend_message_id: params.resendMessageId,
    event_type: params.eventType,
    event_at: params.eventAt,
    recipient: params.recipient ?? null,
    url: params.url ?? null,
    user_agent: params.userAgent ?? null,
    ip_address: params.ipAddress ?? null,
    details: params.details ?? {},
    webhook_event_id: params.webhookEventId,
  })

  if (error) {
    console.error("[mail/webhook] failed to append message event", error)
  }
}

async function updateMessageLifecycle(params: {
  messageId: string
  status: MailDeliveryStatus
  eventType: ResendTrackedEventType
  eventAt: string
  errorText?: string | null
  complainedAt?: string | null
  suppressedAt?: string | null
  openCountIncrement?: number
  clickCountIncrement?: number
}): Promise<void> {
  const update: Record<string, unknown> = {
    delivery_status: params.status,
    last_delivery_event_at: params.eventAt,
    last_delivery_event_type: params.eventType,
    updated_at: new Date().toISOString(),
  }
  if (params.errorText !== undefined) {
    update.last_delivery_error = params.errorText
  }
  if (params.complainedAt !== undefined) {
    update.complained_at = params.complainedAt
  }
  if (params.suppressedAt !== undefined) {
    update.suppressed_at = params.suppressedAt
  }

  if (params.openCountIncrement && params.openCountIncrement > 0) {
    const { error } = await supabase.rpc("mail_increment_open_count", {
      message_id_in: params.messageId,
      increment_by: params.openCountIncrement,
    })
    if (error) {
      console.error("[mail/webhook] open_count increment error", error)
    }
  }

  if (params.clickCountIncrement && params.clickCountIncrement > 0) {
    const { error } = await supabase.rpc("mail_increment_click_count", {
      message_id_in: params.messageId,
      increment_by: params.clickCountIncrement,
    })
    if (error) {
      console.error("[mail/webhook] click_count increment error", error)
    }
  }

  const { error } = await supabase.from("mail_messages").update(update).eq("id", params.messageId)
  if (error) {
    console.error("[mail/webhook] message lifecycle update error", error)
  }
}

async function handleInboundReceived(params: {
  eventId: string
  inboundMessageId: string
}): Promise<{ ok: true; ignored?: string }> {
  let inboundMessage: Awaited<ReturnType<typeof fetchInboundMessageFromResend>>
  try {
    inboundMessage = await fetchInboundMessageFromResend(params.inboundMessageId)
  } catch (error) {
    console.error("[mail/webhook] fetch inbound error", error)
    throw new Error("Failed to fetch inbound message")
  }

  const recipientCandidates = [
    ...inboundMessage.to,
    ...inboundMessage.cc,
    ...inboundMessage.bcc,
  ].map((address) => address.trim().toLowerCase())

  if (!recipientCandidates.length) {
    return { ok: true, ignored: "No recipients" }
  }

  const { data: aliasRows, error: aliasError } = await supabase
    .from("mail_aliases")
    .select("mailbox_id, owner_user_id, alias_email")
    .in("alias_email", recipientCandidates)
    .limit(1)

  if (aliasError) {
    console.error("[mail/webhook] alias lookup error", aliasError)
    throw new Error("Alias lookup failed")
  }

  const alias = (aliasRows ?? [])[0] as
    | { mailbox_id: string; owner_user_id: string; alias_email: string }
    | undefined

  if (!alias) {
    return { ok: true, ignored: "No mailbox alias match" }
  }

  const nowIso = new Date().toISOString()
  const { data: insertedMessage, error: insertMessageError } = await supabase
    .from("mail_messages")
    .insert({
      owner_user_id: alias.owner_user_id,
      mailbox_id: alias.mailbox_id,
      direction: "inbound",
      folder: "inbox",
      resend_inbound_message_id: inboundMessage.inboundMessageId,
      subject: inboundMessage.subject,
      from_address: inboundMessage.from,
      to_addresses: inboundMessage.to,
      cc_addresses: inboundMessage.cc,
      bcc_addresses: inboundMessage.bcc,
      body_text: inboundMessage.text,
      body_html: inboundMessage.html,
      snippet: toSnippet(inboundMessage.text, inboundMessage.html),
      received_at: inboundMessage.receivedAt ?? nowIso,
      sent_at: null,
      is_read: false,
      has_attachments: inboundMessage.attachments.length > 0,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single()

  if (insertMessageError) {
    console.error("[mail/webhook] insert message error", insertMessageError)
    throw new Error("Failed to save inbound message")
  }

  const messageId = (insertedMessage as { id: string }).id

  if (inboundMessage.attachments.length > 0) {
    for (const attachment of inboundMessage.attachments) {
      try {
        const saved = await saveMailAttachment({
          ownerUserId: alias.owner_user_id,
          messageId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          data: attachment.data,
        })

        const { error: attachmentError } = await supabase
          .from("mail_attachments")
          .insert({
            owner_user_id: alias.owner_user_id,
            message_id: messageId,
            storage_key: saved.storageKey,
            file_name: attachment.fileName,
            mime_type: attachment.mimeType,
            size_bytes: saved.sizeBytes,
            content_id: attachment.contentId,
            is_inline: attachment.isInline,
          })

        if (attachmentError) {
          console.error("[mail/webhook] attachment row insert error", attachmentError)
        }
      } catch (error) {
        console.error("[mail/webhook] attachment store error", error)
      }
    }
  }

  await appendMessageEvent({
    ownerUserId: alias.owner_user_id,
    messageId,
    resendMessageId: null,
    eventType: "email.received",
    eventAt: inboundMessage.receivedAt ?? nowIso,
    webhookEventId: params.eventId,
    recipient: alias.alias_email,
  })

  return { ok: true }
}

async function handleOutboundEvent(params: {
  eventId: string
  eventType: Exclude<ResendTrackedEventType, "email.received">
  messageId: string | null
  data: Record<string, unknown> | null
}): Promise<{ ok: true; ignored?: string }> {
  const msg = await findMessageByResendMessageId(params.messageId)
  if (!msg) {
    return { ok: true, ignored: "No outbound message match" }
  }

  const eventAt = getDataDateIso(params.data, [
    "created_at",
    "timestamp",
    "occurred_at",
    "date",
  ])
  const recipient = getDataString(params.data, ["to", "recipient", "email"])
  const clickedUrl = getDataString(params.data, ["url", "link", "clicked_url"])
  const userAgent = getDataString(params.data, ["user_agent"])
  const ipAddress = getDataString(params.data, ["ip_address"])
  const reason =
    getDataString(params.data, ["reason", "error", "failure_reason", "bounce_reason"]) ?? null

  await appendMessageEvent({
    ownerUserId: msg.owner_user_id,
    messageId: msg.id,
    resendMessageId: params.messageId,
    eventType: params.eventType,
    eventAt,
    webhookEventId: params.eventId,
    recipient,
    url: clickedUrl,
    userAgent,
    ipAddress,
    details: params.data ?? {},
  })

  if (params.eventType === "email.opened") {
    const increment = getDataNumber(params.data, ["opens", "open_count"]) ?? 1
    await updateMessageLifecycle({
      messageId: msg.id,
      status: "delivered",
      eventType: params.eventType,
      eventAt,
      openCountIncrement: Math.max(1, increment),
    })
    return { ok: true }
  }

  if (params.eventType === "email.clicked") {
    const increment = getDataNumber(params.data, ["clicks", "click_count"]) ?? 1
    await updateMessageLifecycle({
      messageId: msg.id,
      status: "delivered",
      eventType: params.eventType,
      eventAt,
      clickCountIncrement: Math.max(1, increment),
    })
    return { ok: true }
  }

  if (params.eventType === "email.scheduled") {
    await updateMessageLifecycle({
      messageId: msg.id,
      status: "scheduled",
      eventType: params.eventType,
      eventAt,
    })
    return { ok: true }
  }

  if (params.eventType === "email.sent") {
    await updateMessageLifecycle({
      messageId: msg.id,
      status: "sent",
      eventType: params.eventType,
      eventAt,
      errorText: null,
    })
    return { ok: true }
  }

  if (params.eventType === "email.delivered") {
    await updateMessageLifecycle({
      messageId: msg.id,
      status: "delivered",
      eventType: params.eventType,
      eventAt,
      errorText: null,
    })
    return { ok: true }
  }

  if (params.eventType === "email.delivery_delayed") {
    await updateMessageLifecycle({
      messageId: msg.id,
      status: "delivery_delayed",
      eventType: params.eventType,
      eventAt,
      errorText: reason,
    })
    return { ok: true }
  }

  if (params.eventType === "email.failed") {
    await updateMessageLifecycle({
      messageId: msg.id,
      status: "failed",
      eventType: params.eventType,
      eventAt,
      errorText: reason,
    })
    return { ok: true }
  }

  if (params.eventType === "email.bounced") {
    await updateMessageLifecycle({
      messageId: msg.id,
      status: "bounced",
      eventType: params.eventType,
      eventAt,
      errorText: reason,
    })
    return { ok: true }
  }

  if (params.eventType === "email.complained") {
    await updateMessageLifecycle({
      messageId: msg.id,
      status: "failed",
      eventType: params.eventType,
      eventAt,
      errorText: reason,
      complainedAt: eventAt,
    })
    return { ok: true }
  }

  if (params.eventType === "email.suppressed") {
    await updateMessageLifecycle({
      messageId: msg.id,
      status: "suppressed",
      eventType: params.eventType,
      eventAt,
      errorText: reason,
      suppressedAt: eventAt,
    })
    return { ok: true }
  }

  return { ok: true }
}

mailWebhookRoutes.post("/resend", async (c) => {
  const rawBody = await c.req.text()

  let payload: Record<string, unknown>
  try {
    payload = verifyResendWebhookOrThrow({
      rawBody,
      headers: c.req.raw.headers,
    })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Invalid signature" },
      401
    )
  }

  const { eventId, eventType, inboundMessageId, messageId, data } =
    extractResendWebhookMeta(payload)
  if (!eventId || !eventType) {
    return c.json({ error: "Missing event metadata" }, 400)
  }

  if (!TRACKED_WEBHOOK_EVENTS.has(eventType as ResendTrackedEventType)) {
    return c.json({ ok: true, ignored: "Untracked event type" })
  }

  const { error: idempotencyError } = await supabase
    .from("mail_webhook_events")
    .insert({
      provider: "resend",
      event_id: eventId,
      event_type: eventType,
      payload_sha256: null,
    })

  if (idempotencyError) {
    if (idempotencyError.code === "23505") {
      return c.json({ ok: true, duplicate: true })
    }
    console.error("[mail/webhook] idempotency error", idempotencyError)
    return c.json({ error: "Failed to process webhook" }, 500)
  }

  try {
    let result: { ok: true; ignored?: string }
    if (eventType === "email.received") {
      if (!inboundMessageId) {
        return c.json({ error: "Missing inbound message ID" }, 400)
      }
      result = await handleInboundReceived({
        eventId,
        inboundMessageId,
      })
    } else {
      const outboundEventType = eventType as Exclude<
        ResendTrackedEventType,
        "email.received"
      >
      result = await handleOutboundEvent({
        eventId,
        eventType: outboundEventType,
        messageId,
        data,
      })
    }

    await supabase
      .from("mail_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", "resend")
      .eq("event_id", eventId)

    return c.json(result)
  } catch (error) {
    console.error("[mail/webhook] handler failure", { eventType, error })
    return c.json({ error: "Failed to handle webhook event" }, 500)
  }
})
