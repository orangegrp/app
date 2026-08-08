import type { MailFolder, MailMessageDetail, MailMessageSummary } from "@/lib/mail-api"

const LIST_KEY_PREFIX = "mail:list:"
const DETAIL_KEY_PREFIX = "mail:detail:"
const ATTACHMENT_KEY_PREFIX = "mail:attachment:"
const MAX_ATTACHMENT_CACHE_BYTES = 2 * 1024 * 1024
const SMALL_ATTACHMENT_LIMIT_BYTES = 64 * 1024
const LIST_TTL_MS = 5 * 60_000
const DETAIL_TTL_MS = 10 * 60_000
const ATTACHMENT_TTL_MS = 24 * 60 * 60_000

type CachedList = {
  folder: MailFolder
  storedAt: number
  messages: MailMessageSummary[]
}

type CachedDetail = {
  storedAt: number
  message: MailMessageDetail
}

type CachedAttachment = {
  id: string
  mimeType: string
  fileName: string
  sizeBytes: number
  base64Data: string
  storedAt: number
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

function readJson<T>(key: string): T | null {
  if (!hasStorage()) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  if (!hasStorage()) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota/write failures
  }
}

export function getCachedMailList(folder: MailFolder): MailMessageSummary[] | null {
  const cached = readJson<CachedList>(`${LIST_KEY_PREFIX}${folder}`)
  if (!cached) return null
  if (Date.now() - cached.storedAt > LIST_TTL_MS) return null
  return cached.messages
}

export function setCachedMailList(folder: MailFolder, messages: MailMessageSummary[]): void {
  const payload: CachedList = {
    folder,
    storedAt: Date.now(),
    messages,
  }
  writeJson(`${LIST_KEY_PREFIX}${folder}`, payload)
}

export function getCachedMailDetail(messageId: string): MailMessageDetail | null {
  const cached = readJson<CachedDetail>(`${DETAIL_KEY_PREFIX}${messageId}`)
  if (!cached) return null
  if (Date.now() - cached.storedAt > DETAIL_TTL_MS) return null
  return cached.message
}

export function setCachedMailDetail(messageId: string, message: MailMessageDetail): void {
  writeJson(`${DETAIL_KEY_PREFIX}${messageId}`, {
    storedAt: Date.now(),
    message,
  } satisfies CachedDetail)
}

export function evictStaleMailCache(): void {
  if (!hasStorage()) return
  const keysToDelete: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key) continue
    if (key.startsWith(LIST_KEY_PREFIX)) {
      const cached = readJson<CachedList>(key)
      if (!cached || Date.now() - cached.storedAt > LIST_TTL_MS) {
        keysToDelete.push(key)
      }
      continue
    }
    if (key.startsWith(DETAIL_KEY_PREFIX)) {
      const cached = readJson<CachedDetail>(key)
      if (!cached || Date.now() - cached.storedAt > DETAIL_TTL_MS) {
        keysToDelete.push(key)
      }
      continue
    }
    if (key.startsWith(ATTACHMENT_KEY_PREFIX)) {
      const cached = readJson<CachedAttachment>(key)
      if (!cached || Date.now() - cached.storedAt > ATTACHMENT_TTL_MS) {
        keysToDelete.push(key)
      }
    }
  }
  for (const key of keysToDelete) {
    localStorage.removeItem(key)
  }
}

export function getCachedSmallAttachment(id: string): CachedAttachment | null {
  const cached = readJson<CachedAttachment>(`${ATTACHMENT_KEY_PREFIX}${id}`)
  if (!cached) return null
  if (Date.now() - cached.storedAt > ATTACHMENT_TTL_MS) return null
  return cached
}

function totalAttachmentCacheSizeBytes(): number {
  if (!hasStorage()) return 0
  let total = 0
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(ATTACHMENT_KEY_PREFIX)) continue
    const value = localStorage.getItem(key)
    if (!value) continue
    total += value.length
  }
  return total
}

function pruneAttachmentCacheIfNeeded(): void {
  if (!hasStorage()) return
  if (totalAttachmentCacheSizeBytes() <= MAX_ATTACHMENT_CACHE_BYTES) return

  const entries: Array<{ key: string; storedAt: number }> = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(ATTACHMENT_KEY_PREFIX)) continue
    const cached = readJson<CachedAttachment>(key)
    if (!cached) continue
    entries.push({ key, storedAt: cached.storedAt })
  }

  entries.sort((a, b) => a.storedAt - b.storedAt)
  for (const entry of entries) {
    if (totalAttachmentCacheSizeBytes() <= MAX_ATTACHMENT_CACHE_BYTES) break
    localStorage.removeItem(entry.key)
  }
}

export async function cacheSmallAttachment(params: {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  signedDownloadUrl: string
}): Promise<void> {
  if (!hasStorage()) return
  if (params.sizeBytes > SMALL_ATTACHMENT_LIMIT_BYTES) return

  try {
    const res = await fetch(params.signedDownloadUrl, { cache: "no-store" })
    if (!res.ok) return
    const arrayBuffer = await res.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ""
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    const base64Data = btoa(binary)
    writeJson(`${ATTACHMENT_KEY_PREFIX}${params.id}`, {
      id: params.id,
      fileName: params.fileName,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      base64Data,
      storedAt: Date.now(),
    } satisfies CachedAttachment)
    pruneAttachmentCacheIfNeeded()
  } catch {
    // Ignore attachment cache failures.
  }
}
