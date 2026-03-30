import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { QR_ROLLING_COUNTER_TOLERANCE, QR_ROLLING_STEP_MS } from '@/lib/qr-shared'

const HMAC_DIGEST_BYTES = 32
const SECRET_HEX_LENGTH = 64

function parseSecretKey(secret: string): Buffer {
  if (typeof secret !== 'string' || secret.length !== SECRET_HEX_LENGTH) {
    throw new Error('Invalid QR rolling token key format')
  }
  if (!/^[0-9a-f]{64}$/i.test(secret)) {
    throw new Error('Invalid QR rolling token key format')
  }
  return Buffer.from(secret, 'hex')
}

function tryParseSecretKey(secret: string): Buffer | null {
  try {
    return parseSecretKey(secret)
  } catch {
    return null
  }
}

function counterToBE64(counter: number): Buffer {
  const buf = Buffer.allocUnsafe(8)
  buf.writeBigUInt64BE(BigInt(counter), 0)
  return buf
}

function rollingMac(key: Buffer, counter: number): Buffer {
  return createHmac('sha256', key).update(counterToBE64(counter)).digest()
}

/**
 * Generate a cryptographically secure 256-bit key (hex) for QR rolling tokens.
 */
export function generateTotpSecret(): string {
  return randomBytes(32).toString('hex')
}

function getQrRollingCounter(): number {
  return Math.floor(Date.now() / QR_ROLLING_STEP_MS)
}

/**
 * Current rolling token for the QR login URL (changes every {@link QR_ROLLING_STEP_MS} ms).
 * Full HMAC-SHA256 output, base64url-encoded (~43 characters).
 */
export function generateQrRollingToken(secret: string): string {
  const key = parseSecretKey(secret)
  const tag = rollingMac(key, getQrRollingCounter())
  return tag.toString('base64url')
}

/**
 * Verify token from a scanned QR URL against the session key.
 * Accepts any counter within ±{@link QR_ROLLING_COUNTER_TOLERANCE} of the current step.
 */
export function verifyQrRollingToken(token: string, secret: string): boolean {
  const key = tryParseSecretKey(secret)
  if (!key) return false

  let tokenBytes: Buffer
  try {
    tokenBytes = Buffer.from(token, 'base64url')
  } catch {
    return false
  }
  if (tokenBytes.length !== HMAC_DIGEST_BYTES) return false

  const center = getQrRollingCounter()
  const tol = QR_ROLLING_COUNTER_TOLERANCE

  for (let delta = -tol; delta <= tol; delta++) {
    const c = center + delta
    if (c < 0) continue
    const tag = rollingMac(key, c)
    if (timingSafeEqual(tokenBytes, tag)) return true
  }
  return false
}

/**
 * Milliseconds until the next rolling step boundary (for GET /auth/qr/code `remainingMs`).
 */
export function getQrRollingStepRemainingMs(): number {
  const stepMs = QR_ROLLING_STEP_MS
  return stepMs - (Date.now() % stepMs)
}
