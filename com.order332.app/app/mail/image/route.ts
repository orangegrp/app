import "server-only"
import dns from "node:dns/promises"
import { isIP } from "node:net"
import { supabase } from "@/server/db/supabase/client"
import { verifyMailProxyToken } from "@/server/lib/mail-proxy-token"
import { signMailAttachmentUrl } from "@/server/lib/mail-storage"

const MAX_EXTERNAL_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 4
const FETCH_TIMEOUT_MS = 7000

type AttachmentRow = {
  id: string
  owner_user_id: string
  storage_key: string
  mime_type: string
}

function isBlockedExternalUrl(value: string): boolean {
  try {
    const u = new URL(value)
    const host = u.hostname.toLowerCase()
    if (u.protocol !== "http:" && u.protocol !== "https:") return true
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return true
    }
    if (host.endsWith(".local")) return true
    if (host.endsWith(".internal")) return true
    if (host === "metadata.google.internal") return true
    return false
  } catch {
    return true
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === "::1") return true
  if (normalized.startsWith("fe80:")) return true
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.replace("::ffff:", "")
    if (isIP(mapped) === 4) return isPrivateIPv4(mapped)
  }
  return false
}

function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isPrivateIPv4(ip)
  if (version === 6) return isPrivateIPv6(ip)
  return true
}

async function assertSafeNetworkTarget(target: URL): Promise<void> {
  if (isBlockedExternalUrl(target.toString())) {
    throw new Error("Blocked external URL")
  }

  const directIpVersion = isIP(target.hostname)
  if (directIpVersion > 0 && isPrivateAddress(target.hostname)) {
    throw new Error("Blocked private IP target")
  }

  if (directIpVersion > 0) return

  const resolved = await dns.lookup(target.hostname, {
    all: true,
    verbatim: true,
  })

  if (!resolved.length) {
    throw new Error("Unresolvable target")
  }

  for (const addr of resolved) {
    if (isPrivateAddress(addr.address)) {
      throw new Error("Blocked private DNS resolution")
    }
  }
}

async function fetchExternalImageSafely(rawUrl: string): Promise<Response> {
  let current = new URL(rawUrl)

  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    await assertSafeNetworkTarget(current)

    const res = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location")
      if (!location) throw new Error("Redirect with no location")
      current = new URL(location, current)
      continue
    }

    if (!res.ok || !res.body) {
      throw new Error("Upstream image unavailable")
    }

    const contentType = res.headers.get("content-type") ?? ""
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error("Upstream is not an image")
    }

    const contentLength = Number.parseInt(
      res.headers.get("content-length") ?? "",
      10
    )
    if (Number.isFinite(contentLength) && contentLength > MAX_EXTERNAL_IMAGE_BYTES) {
      throw new Error("Upstream image too large")
    }

    const bytes = await res.arrayBuffer()
    if (bytes.byteLength > MAX_EXTERNAL_IMAGE_BYTES) {
      throw new Error("Upstream image too large")
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
      },
    })
  }

  throw new Error("Too many redirects")
}

function imageUnavailable(status = 404): Response {
  return new Response("Image unavailable", {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  })
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token")
  if (!token) return imageUnavailable(401)

  const payload = verifyMailProxyToken(token)
  if (!payload) return imageUnavailable(401)

  if (payload.kind === "external") {
    const src = payload.url ?? ""
    if (isBlockedExternalUrl(src)) return imageUnavailable(400)
    try {
      return await fetchExternalImageSafely(src)
    } catch {
      return imageUnavailable(502)
    }
  }

  const attachmentId = payload.attachmentId
  if (!attachmentId) return imageUnavailable(401)

  const { data, error } = await supabase
    .from("mail_attachments")
    .select("id, owner_user_id, storage_key, mime_type")
    .eq("id", attachmentId)
    .eq("owner_user_id", payload.sub)
    .maybeSingle()

  if (error || !data) return imageUnavailable(404)

  const row = data as AttachmentRow
  if (!row.mime_type.toLowerCase().startsWith("image/")) {
    return imageUnavailable(415)
  }

  let signedUrl: string
  try {
    signedUrl = await signMailAttachmentUrl(row.storage_key, 60)
  } catch {
    return imageUnavailable(502)
  }

  const upstream = await fetch(signedUrl, { cache: "no-store" })
  if (!upstream.ok || !upstream.body) return imageUnavailable(502)

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": row.mime_type,
      "Cache-Control": "private, max-age=60",
    },
  })
}
