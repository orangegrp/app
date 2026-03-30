import type {
  User,
  InviteCode,
  PasskeyCredential,
  Session,
  MagicToken,
  QRLoginSession,
  QRSessionStatus,
  WebAuthnChallenge,
  PendingRegistration,
} from '@/server/lib/types'

export interface CreateUserData {
  discordId?: string
  discordUsername?: string
  discordAvatar?: string
  displayName?: string | null
  permissions?: string
}

export interface UpdateUserData {
  /** Set to `null` to clear Discord link. */
  discordId?: string | null
  discordUsername?: string | null
  discordAvatar?: string | null
  displayName?: string | null
  permissions?: string
  isActive?: boolean
  loginPasskeyEnabled?: boolean
  loginDiscordEnabled?: boolean
  loginMagicEnabled?: boolean
  loginQrEnabled?: boolean
  welcomeWizardCompletedAt?: Date | null
}

export interface CreateInviteCodeData {
  code: string
  createdBy: string
  expiresAt?: Date
  /** Validated CSV from `parseAndValidatePermissionsInput`. */
  permissions?: string
}

export interface CreatePasskeyData {
  userId: string
  credentialId: string
  publicKey: string
  counter: number
  deviceType: string
  backedUp: boolean
  transports?: string
  name?: string
}

export interface CreateSessionData {
  userId: string
  refreshTokenHash: string
  isPwa: boolean
  expiresAt: Date
  ipAddress?: string
  userAgent?: string
}

export interface CreateMagicTokenData {
  tokenHash: string
  discordId: string
  userId?: string
  expiresAt: Date
}

export interface CreateQRSessionData {
  totpSecretEncrypted: string
  desktopIp?: string
  desktopUserAgent?: string
  desktopLocation?: string
  expiresAt: Date
}

export interface CreateChallengeData {
  challenge: string
  userId?: string
  type: 'registration' | 'authentication'
  expiresAt: Date
}

export interface CreatePendingRegistrationData {
  inviteCodeId: string
  registrationToken: string
  expiresAt: Date
}

export interface DBAdapter {
  // Schema management
  validateAndMigrateSchema(): Promise<void>

  // Cleanup
  cleanupExpiredRecords(): Promise<void>

  // Users
  getUserById(id: string): Promise<User | null>
  getUserByDiscordId(discordId: string): Promise<User | null>
  createUser(data: CreateUserData): Promise<User>
  updateUser(id: string, data: UpdateUserData): Promise<User>
  deleteUser(id: string): Promise<void>
  listUsersForAdmin(opts: {
    limit: number
    offset: number
    search?: string
  }): Promise<{ users: User[]; total: number }>
  /** Minimal rows for last-admin guard (freeze/delete). */
  listUserIdAndPermissions(): Promise<{ id: string; permissions: string }[]>
  getUsersByIds(ids: string[]): Promise<User[]>

  // Invite codes
  getInviteCode(code: string): Promise<InviteCode | null>
  getInviteCodeById(id: string): Promise<InviteCode | null>
  listInviteCodes(): Promise<InviteCode[]>
  createInviteCode(data: CreateInviteCodeData): Promise<InviteCode>
  /** Pass user id when known; omit or null during invite claim (pending registration links via invite_code_id). */
  markInviteCodeUsed(id: string, usedBy?: string | null): Promise<void>
  /** Set after registration completes (claim has no user id yet). */
  setInviteCodeUsedByUser(inviteCodeId: string, userId: string): Promise<void>
  deleteInviteCode(id: string): Promise<void>

  // Passkey credentials
  getPasskeyByCredentialId(credentialId: string): Promise<PasskeyCredential | null>
  getPasskeysByUserId(userId: string): Promise<PasskeyCredential[]>
  createPasskeyCredential(data: CreatePasskeyData): Promise<PasskeyCredential>
  updatePasskeyCounter(id: string, counter: number): Promise<void>
  deletePasskeyCredential(id: string): Promise<void>

  // Sessions (refresh tokens)
  createSession(data: CreateSessionData): Promise<Session>
  getSessionById(id: string): Promise<Session | null>
  getSessionByTokenHash(hash: string): Promise<Session | null>
  rotateSession(id: string, newHash: string, newExpiresAt: Date): Promise<Session>
  deleteSession(id: string): Promise<void>
  deleteUserSessions(userId: string): Promise<void>

  // Magic tokens
  getMagicToken(tokenHash: string): Promise<MagicToken | null>
  createMagicToken(data: CreateMagicTokenData): Promise<MagicToken>
  markMagicTokenUsed(id: string): Promise<void>

  // QR login sessions
  createQRSession(data: CreateQRSessionData): Promise<QRLoginSession>
  getQRSession(id: string): Promise<QRLoginSession | null>
  updateQRSessionStatus(
    id: string,
    status: QRSessionStatus,
    data?: {
      mobileUserId?: string
      scannedAt?: Date
      resolvedAt?: Date
    }
  ): Promise<void>

  // WebAuthn challenges (temporary, ~2 min TTL)
  createChallenge(data: CreateChallengeData): Promise<WebAuthnChallenge>
  getChallengeByValue(challenge: string): Promise<WebAuthnChallenge | null>
  deleteChallenge(id: string): Promise<void>

  // Pending registrations (post-invite-code-claim, pre-auth-setup)
  createPendingRegistration(data: CreatePendingRegistrationData): Promise<PendingRegistration>
  getPendingRegistration(token: string): Promise<PendingRegistration | null>
  deletePendingRegistration(id: string): Promise<void>
  /** After Discord OAuth deny during signup: remove pending row and un-burn invite if registration never completed. */
  abortPendingRegistrationAndReleaseInvite(registrationToken: string): Promise<void>
}
