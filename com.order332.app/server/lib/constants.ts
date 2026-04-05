import 'server-only'

// Token lifetimes (seconds)
export const TOKEN_LIFETIMES = {
  browser: {
    access: 60 * 60,            // 1 hour
    refresh: 30 * 24 * 60 * 60, // 30 days
  },
  pwa: {
    access: 24 * 60 * 60,       // 24 hours
    refresh: 30 * 24 * 60 * 60, // 30 days
  },
} as const

// QR code session lifetime (seconds)
export const QR_SESSION_LIFETIME = 120  // 2 minutes max

export { QR_ROLLING_STEP_MS, QR_ROLLING_COUNTER_TOLERANCE } from '@/lib/qr-shared'

// Magic link lifetime (seconds)
export const MAGIC_LINK_LIFETIME = 10 * 60  // 10 minutes

// WebAuthn challenge lifetime (seconds)
export const WEBAUTHN_CHALLENGE_LIFETIME = 120  // 2 minutes

// Pending registration lifetime (seconds)
export const PENDING_REGISTRATION_LIFETIME = 30 * 60  // 30 minutes

// Magic link rate limit
export const MAGIC_LINK_RATE_LIMIT = { max: 5, windowMs: 60_000 }  // 5 per minute

export { PERMISSIONS, hasPermission, hasAnyPermission } from '@/lib/permissions'
