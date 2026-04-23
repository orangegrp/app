import "server-only"
import { createPrivateKey, type KeyObject } from "node:crypto"
import { SignJWT } from "jose"

const MUX_PLAYBACK_TOKEN_TTL_SECONDS = 60 * 60

let cachedPrivateKeyPromise: Promise<KeyObject> | null = null

function getMuxSigningKeyId(): string {
  const keyId = process.env.MUX_SIGNING_KEY_ID
  if (!keyId) {
    throw new Error("MUX_SIGNING_KEY_ID is not configured")
  }
  return keyId
}

function getMuxSigningPrivateKeyPem(): string {
  const rawValue = process.env.MUX_SIGNING_PRIVATE_KEY
  if (!rawValue) {
    throw new Error("MUX_SIGNING_PRIVATE_KEY is not configured")
  }

  const value = rawValue.trim().replace(/\\n/g, "\n")

  const asPem = coerceToPkcs8Pem(value)
  if (!asPem) {
    throw new Error(
      "MUX_SIGNING_PRIVATE_KEY is invalid. Provide a PKCS#8 private key (PEM or base64)."
    )
  }

  return asPem
}

function coerceToPkcs8Pem(value: string): string | null {
  const exportPkcs8Pem = (key: KeyObject): string => {
    return key.export({ format: "pem", type: "pkcs8" }) as string
  }

  const tryCreate = (input: string | Buffer): KeyObject | null => {
    try {
      if (typeof input === "string") {
        return createPrivateKey({ key: input })
      }

      return (
        createPrivateKey({ key: input, format: "der", type: "pkcs8" }) ||
        createPrivateKey({ key: input, format: "der", type: "pkcs1" })
      )
    } catch {
      return null
    }
  }

  const pemLike =
    value.includes("BEGIN PRIVATE KEY") ||
    value.includes("BEGIN RSA PRIVATE KEY") ||
    value.includes("BEGIN ENCRYPTED PRIVATE KEY")
  if (pemLike) {
    const key = tryCreate(value)
    if (!key) return null
    return exportPkcs8Pem(key)
  }

  const normalized = value.replace(/\s+/g, "")
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    return null
  }

  const decoded = Buffer.from(normalized, "base64")
  if (decoded.length === 0) return null

  const decodedText = decoded.toString("utf8")
  const keyFromText = tryCreate(decodedText)
  if (keyFromText) {
    return exportPkcs8Pem(keyFromText)
  }

  const keyFromDerPkcs8 = (() => {
    try {
      return createPrivateKey({ key: decoded, format: "der", type: "pkcs8" })
    } catch {
      return null
    }
  })()
  if (keyFromDerPkcs8) {
    return exportPkcs8Pem(keyFromDerPkcs8)
  }

  const keyFromDerPkcs1 = (() => {
    try {
      return createPrivateKey({ key: decoded, format: "der", type: "pkcs1" })
    } catch {
      return null
    }
  })()
  if (keyFromDerPkcs1) {
    return exportPkcs8Pem(keyFromDerPkcs1)
  }

  return null
}

async function getMuxSigningKey(): Promise<KeyObject> {
  if (!cachedPrivateKeyPromise) {
    cachedPrivateKeyPromise = Promise.resolve(
      createPrivateKey({ key: getMuxSigningPrivateKeyPem() })
    )
  }
  return cachedPrivateKeyPromise
}

export async function signMuxPlaybackToken(playbackId: string): Promise<{
  token: string
  expiresAt: string
}>
export async function signMuxPlaybackToken(
  playbackId: string,
  audience: "v" | "t"
): Promise<{
  token: string
  expiresAt: string
}>
export async function signMuxPlaybackToken(
  playbackId: string,
  audience: "v" | "t" = "v"
): Promise<{
  token: string
  expiresAt: string
}> {
  const keyId = getMuxSigningKeyId()
  const now = Math.floor(Date.now() / 1000)
  const exp = now + MUX_PLAYBACK_TOKEN_TTL_SECONDS

  const token = await new SignJWT({ kid: keyId })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject(playbackId)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(await getMuxSigningKey())

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
  }
}

export async function buildSignedMuxHlsUrl(playbackId: string): Promise<{
  url: string
  expiresAt: string
}> {
  const { token, expiresAt } = await signMuxPlaybackToken(playbackId, "v")
  return {
    url: `https://stream.mux.com/${playbackId}.m3u8?token=${encodeURIComponent(token)}`,
    expiresAt,
  }
}

export async function buildSignedMuxThumbnailUrl(
  playbackId: string,
  width = 1280
): Promise<{ url: string; expiresAt: string }> {
  const { token, expiresAt } = await signMuxPlaybackToken(playbackId, "t")
  return {
    url: `https://image.mux.com/${playbackId}/thumbnail.jpg?token=${encodeURIComponent(token)}&width=${Math.max(320, Math.floor(width))}`,
    expiresAt,
  }
}

async function isPlayableVideoUrl(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
    })
    if (head.ok) return true
    if (head.status !== 405) return false
  } catch {
    return false
  }

  try {
    const get = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      redirect: "follow",
      cache: "no-store",
    })
    return get.ok || get.status === 206
  } catch {
    return false
  }
}

export async function buildSignedMuxMp4Url(
  playbackId: string
): Promise<{ url: string; expiresAt: string } | null> {
  const { token, expiresAt } = await signMuxPlaybackToken(playbackId, "v")
  const tokenParam = `token=${encodeURIComponent(token)}`
  const candidates = [
    `https://stream.mux.com/${playbackId}/high.mp4?${tokenParam}`,
    `https://stream.mux.com/${playbackId}/medium.mp4?${tokenParam}`,
    `https://stream.mux.com/${playbackId}/low.mp4?${tokenParam}`,
    `https://stream.mux.com/${playbackId}.mp4?${tokenParam}`,
  ]

  for (const candidate of candidates) {
    if (await isPlayableVideoUrl(candidate)) {
      return { url: candidate, expiresAt }
    }
  }

  return null
}
