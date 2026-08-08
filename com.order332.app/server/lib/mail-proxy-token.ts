import "server-only"
import { hmacSign, safeCompare } from "@/server/lib/crypto"

const DEFAULT_TTL_SECONDS = 60 * 5

type MailProxyTokenKind = "attachment" | "external"

type MailProxyTokenPayload = {
  sub: string
  exp: number
  kind: MailProxyTokenKind
  attachmentId?: string
  url?: string
}

function getSecret(): string {
  const secret =
    process.env.MAIL_IMAGE_PROXY_SECRET ?? process.env.JWT_SECRET ?? ""
  if (!secret) {
    throw new Error("Missing MAIL_IMAGE_PROXY_SECRET or JWT_SECRET")
  }
  return secret
}

function encodePayload(payload: MailProxyTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodePayload(encoded: string): MailProxyTokenPayload | null {
  try {
    const raw = Buffer.from(encoded, "base64url").toString("utf8")
    const parsed = JSON.parse(raw) as Partial<MailProxyTokenPayload>
    if (!parsed || typeof parsed !== "object") return null
    if (typeof parsed.sub !== "string") return null
    if (typeof parsed.exp !== "number") return null
    if (parsed.kind !== "attachment" && parsed.kind !== "external") return null
    if (parsed.kind === "attachment" && typeof parsed.attachmentId !== "string") {
      return null
    }
    if (parsed.kind === "external" && typeof parsed.url !== "string") {
      return null
    }
    return parsed as MailProxyTokenPayload
  } catch {
    return null
  }
}

export function createMailAttachmentProxyToken(params: {
  userId: string
  attachmentId: string
  ttlSeconds?: number
}): string {
  const exp = Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? DEFAULT_TTL_SECONDS)
  const payload: MailProxyTokenPayload = {
    sub: params.userId,
    exp,
    kind: "attachment",
    attachmentId: params.attachmentId,
  }
  const encodedPayload = encodePayload(payload)
  const sig = hmacSign(getSecret(), encodedPayload)
  return `${encodedPayload}.${sig}`
}

export function createMailExternalImageProxyToken(params: {
  userId: string
  url: string
  ttlSeconds?: number
}): string {
  const exp = Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? DEFAULT_TTL_SECONDS)
  const payload: MailProxyTokenPayload = {
    sub: params.userId,
    exp,
    kind: "external",
    url: params.url,
  }
  const encodedPayload = encodePayload(payload)
  const sig = hmacSign(getSecret(), encodedPayload)
  return `${encodedPayload}.${sig}`
}

export function verifyMailProxyToken(token: string): MailProxyTokenPayload | null {
  const [encodedPayload, sig] = token.split(".")
  if (!encodedPayload || !sig) return null

  const expectedSig = hmacSign(getSecret(), encodedPayload)
  if (!safeCompare(sig, expectedSig)) return null

  const payload = decodePayload(encodedPayload)
  if (!payload) return null
  if (payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

export type { MailProxyTokenPayload }
