import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client"

export type MailFolder = "inbox" | "sent"

export interface MailMessageSummary {
  id: string
  direction: "inbound" | "outbound"
  folder: MailFolder
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
}

export interface MailAttachmentView {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  isInline: boolean
  contentId: string | null
  imageProxyUrl: string | null
  signedDownloadUrl: string
}

export interface MailMessageDetail extends MailMessageSummary {
  bodyText: string | null
  bodyHtml: string | null
  attachments: MailAttachmentView[]
}

export async function listMailMessages(folder: MailFolder): Promise<MailMessageSummary[]> {
  const res = await apiGet<{ messages: MailMessageSummary[] }>(
    `/mail/messages?folder=${encodeURIComponent(folder)}`
  )
  return res.messages
}

export async function getMailMessage(messageId: string): Promise<MailMessageDetail> {
  const res = await apiGet<{ message: MailMessageDetail }>(
    `/mail/messages/${encodeURIComponent(messageId)}`
  )
  return res.message
}

export async function sendMail(params: {
  to: string[]
  subject: string
  text: string
  html?: string | null
  demo?: boolean
}): Promise<MailMessageSummary> {
  const res = await apiPost<{ message: MailMessageSummary }>("/mail/send", {
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html ?? null,
    demo: params.demo === true,
  })
  return res.message
}

export async function setMailReadState(messageId: string, isRead: boolean): Promise<void> {
  await apiPost<{ ok: true }>(`/mail/messages/${encodeURIComponent(messageId)}/read`, {
    isRead,
  })
}

export async function deleteMailMessage(messageId: string): Promise<void> {
  await apiDelete<{ ok: true }>(`/mail/messages/${encodeURIComponent(messageId)}`)
}

export async function bulkMailAction(
  ids: string[],
  action: "delete" | "mark_read" | "mark_unread"
): Promise<void> {
  await apiPost<{ ok: true }>("/mail/messages/bulk-action", { ids, action })
}

// ── Mail Setup / Settings ─────────────────────────────────────────────────────

export interface MailAliasRow {
  id: string
  aliasEmail: string
  createdAt: string
}

export interface MailSetupState {
  setupCompleted: boolean
  primaryEmail: string | null
  defaultAlias: string | null
  domainConfigured: boolean
  demoMode: boolean
  aliasMax: number
  aliasCount: number
  aliases: MailAliasRow[]
  mailbox: {
    id: string
    primaryEmail: string
    displayName: string | null
    isActive: boolean
    createdAt: string
  } | null
}

export async function getMailSetupState(): Promise<MailSetupState> {
  return apiGet<MailSetupState>("/mail/setup")
}

export async function completeMailSetup(alias?: string | null): Promise<{
  ok: boolean
  mailSetupCompleted: boolean
  primaryEmail: string
}> {
  return apiPost("/mail/setup/complete", { alias: alias ?? null })
}

export async function updateMailAliases(aliases: string[]): Promise<{
  ok: boolean
  aliases: MailAliasRow[]
}> {
  return apiPut("/mail/setup/aliases", { aliases })
}
