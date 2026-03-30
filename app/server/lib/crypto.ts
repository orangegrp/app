import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual, createHash } from 'crypto'

const ENCRYPTION_KEY_ENV = 'QR_ENCRYPTION_KEY'
const ALGORITHM = 'aes-256-gcm'

function getEncryptionKey(): Buffer {
  const key = process.env[ENCRYPTION_KEY_ENV]
  if (!key) throw new Error(`Missing ${ENCRYPTION_KEY_ENV} environment variable`)
  const buf = Buffer.from(key, 'hex')
  if (buf.length !== 32) throw new Error(`${ENCRYPTION_KEY_ENV} must be 32 bytes (64 hex chars)`)
  return buf
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns: iv:authTag:ciphertext (all hex encoded, colon-separated)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)  // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypt ciphertext produced by encrypt().
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey()
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':')
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error('Invalid ciphertext format')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}

/**
 * Compute SHA-256 hash of input and return as hex string.
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Generate a cryptographically secure random hex string of given byte length.
 */
export function randomHex(bytes = 32): string {
  return randomBytes(bytes).toString('hex')
}

/**
 * Generate a cryptographically secure random base64url string.
 */
export function randomBase64url(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Constant-time comparison to prevent timing attacks.
 * Both inputs are hashed first to ensure equal lengths.
 */
export function safeCompare(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Generate an HMAC-SHA256 signature.
 */
export function hmacSign(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}
