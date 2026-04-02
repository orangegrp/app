import 'server-only'

export interface User {
  id: string
  createdAt: Date
  updatedAt: Date
  discordId?: string
  discordUsername?: string
  discordAvatar?: string
  /** Optional display name (non-Discord); shown in UI over Discord username when set. */
  displayName?: string | null
  permissions: string  // CSV mini-app + admin perms, or "*"
  isActive: boolean
  /** When false, passkey login (POST /auth/verify) is rejected. */
  loginPasskeyEnabled: boolean
  /** When false, Discord OAuth login is rejected. */
  loginDiscordEnabled: boolean
  /** When false, magic link verify is rejected. */
  loginMagicEnabled: boolean
  /** When false, QR finalize (desktop session) is rejected. */
  loginQrEnabled: boolean
  /** Set when the user finishes the first-login welcome wizard. */
  welcomeWizardCompletedAt?: Date
}

export interface InviteCode {
  id: string
  code: string
  createdBy?: string
  createdAt: Date
  expiresAt?: Date
  usedAt?: Date
  usedBy?: string
  isUsed: boolean
  /** CSV of permissions granted on registration (validated at invite creation). */
  permissions: string
}

export interface PasskeyCredential {
  id: string
  userId: string
  credentialId: string
  publicKey: string   // base64url encoded COSE key
  counter: number
  deviceType: string
  backedUp: boolean
  transports?: string // JSON array string
  createdAt: Date
  lastUsedAt?: Date
  name?: string       // user-defined e.g. "MacBook Touch ID"
}

export interface Session {
  id: string
  userId: string
  refreshTokenHash: string  // SHA-256 of the raw refresh token
  isPwa: boolean
  expiresAt: Date
  createdAt: Date
  lastUsedAt: Date
  ipAddress?: string
  userAgent?: string
}

export interface MagicToken {
  id: string
  tokenHash: string   // SHA-256 of the raw HMAC token
  discordId: string
  userId?: string
  expiresAt: Date
  usedAt?: Date
  isUsed: boolean
  createdAt: Date
}

export type QRSessionStatus = 'pending' | 'scanned' | 'approved' | 'rejected' | 'expired'

export interface QRLoginSession {
  id: string
  /** AES-GCM encrypted HMAC key (hex) for rolling QR URL tokens (`totp_secret_encrypted` in DB). */
  totpSecretEncrypted: string
  status: QRSessionStatus
  desktopIp?: string
  desktopUserAgent?: string
  desktopLocation?: string
  mobileUserId?: string
  expiresAt: Date
  createdAt: Date
  scannedAt?: Date
  resolvedAt?: Date
}

export interface WebAuthnChallenge {
  id: string
  challenge: string
  userId?: string
  /** Set for invite sign-up registration challenges (ties row to pending_registrations). */
  pendingRegistrationId?: string
  type: 'registration' | 'authentication'
  expiresAt: Date
  createdAt: Date
}

export interface PendingRegistration {
  id: string
  inviteCodeId: string
  registrationToken: string  // short-lived token for completing registration
  expiresAt: Date
  createdAt: Date
}

export interface JWTPayload {
  sub: string          // user id
  sessionId: string    // bound session id — validated server-side on every request
  permissions: string  // CSV permissions string
  isPwa: boolean
  iat: number
  exp: number
}

// Hono context variable bindings
export interface HonoEnv {
  Variables: {
    user: {
      id: string
      permissions: string
      isPwa: boolean
    }
  }
}
