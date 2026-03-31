import 'server-only'
import { supabase } from './client'
import { validateAndMigrateSchema } from './schema'
import type {
  DBAdapter,
  CreateUserData,
  UpdateUserData,
  CreateInviteCodeData,
  CreatePasskeyData,
  CreateSessionData,
  CreateMagicTokenData,
  CreateQRSessionData,
  CreateChallengeData,
  CreatePendingRegistrationData,
} from '../interface'
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

function mapUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    discordId: (row.discord_id as string | null) ?? undefined,
    discordUsername: (row.discord_username as string | null) ?? undefined,
    discordAvatar: (row.discord_avatar as string | null) ?? undefined,
    displayName: (row.display_name as string | null) ?? undefined,
    permissions: row.permissions as string,
    isActive: row.is_active as boolean,
    loginPasskeyEnabled: (row.login_passkey_enabled as boolean | null | undefined) ?? true,
    loginDiscordEnabled: (row.login_discord_enabled as boolean | null | undefined) ?? true,
    loginMagicEnabled: (row.login_magic_enabled as boolean | null | undefined) ?? true,
    loginQrEnabled: (row.login_qr_enabled as boolean | null | undefined) ?? true,
    welcomeWizardCompletedAt: row.welcome_wizard_completed_at
      ? new Date(row.welcome_wizard_completed_at as string)
      : undefined,
  }
}

function mapInviteCode(row: Record<string, unknown>): InviteCode {
  return {
    id: row.id as string,
    code: row.code as string,
    createdBy: (row.created_by as string | null) ?? undefined,
    createdAt: new Date(row.created_at as string),
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
    usedAt: row.used_at ? new Date(row.used_at as string) : undefined,
    usedBy: (row.used_by as string | null) ?? undefined,
    isUsed: row.is_used as boolean,
    permissions: (row.permissions as string | undefined) ?? '',
  }
}

function mapPasskey(row: Record<string, unknown>): PasskeyCredential {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    credentialId: row.credential_id as string,
    publicKey: row.public_key as string,
    counter: Number(row.counter),
    deviceType: row.device_type as string,
    backedUp: row.backed_up as boolean,
    transports: (row.transports as string | null) ?? undefined,
    createdAt: new Date(row.created_at as string),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string) : undefined,
    name: (row.name as string | null) ?? undefined,
  }
}

function mapSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    refreshTokenHash: row.refresh_token_hash as string,
    isPwa: row.is_pwa as boolean,
    expiresAt: new Date(row.expires_at as string),
    createdAt: new Date(row.created_at as string),
    lastUsedAt: new Date(row.last_used_at as string),
    ipAddress: (row.ip_address as string | null) ?? undefined,
    userAgent: (row.user_agent as string | null) ?? undefined,
  }
}

function mapMagicToken(row: Record<string, unknown>): MagicToken {
  return {
    id: row.id as string,
    tokenHash: row.token_hash as string,
    discordId: row.discord_id as string,
    userId: (row.user_id as string | null) ?? undefined,
    expiresAt: new Date(row.expires_at as string),
    usedAt: row.used_at ? new Date(row.used_at as string) : undefined,
    isUsed: row.is_used as boolean,
    createdAt: new Date(row.created_at as string),
  }
}

function mapQRSession(row: Record<string, unknown>): QRLoginSession {
  return {
    id: row.id as string,
    totpSecretEncrypted: row.totp_secret_encrypted as string,
    status: row.status as QRSessionStatus,
    desktopIp: (row.desktop_ip as string | null) ?? undefined,
    desktopUserAgent: (row.desktop_user_agent as string | null) ?? undefined,
    desktopLocation: (row.desktop_location as string | null) ?? undefined,
    mobileUserId: (row.mobile_user_id as string | null) ?? undefined,
    expiresAt: new Date(row.expires_at as string),
    createdAt: new Date(row.created_at as string),
    scannedAt: row.scanned_at ? new Date(row.scanned_at as string) : undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
  }
}

function mapChallenge(row: Record<string, unknown>): WebAuthnChallenge {
  return {
    id: row.id as string,
    challenge: row.challenge as string,
    userId: (row.user_id as string | null) ?? undefined,
    type: row.type as 'registration' | 'authentication',
    expiresAt: new Date(row.expires_at as string),
    createdAt: new Date(row.created_at as string),
  }
}

function mapPendingReg(row: Record<string, unknown>): PendingRegistration {
  return {
    id: row.id as string,
    inviteCodeId: row.invite_code_id as string,
    registrationToken: row.registration_token as string,
    expiresAt: new Date(row.expires_at as string),
    createdAt: new Date(row.created_at as string),
  }
}

function dbErr(context: string, error: unknown): never {
  throw new Error(`[DB:${context}] ${error instanceof Error ? error.message : String(error)}`)
}

export class SupabaseAdapter implements DBAdapter {
  async validateAndMigrateSchema(): Promise<void> {
    await validateAndMigrateSchema()
  }

  async cleanupExpiredRecords(): Promise<void> {
    const now = new Date().toISOString()
    await Promise.allSettled([
      supabase.from('qr_login_sessions').delete().lt('expires_at', now),
      supabase.from('magic_tokens').delete().lt('expires_at', now).eq('is_used', false),
      supabase.from('webauthn_challenges').delete().lt('expires_at', now),
      supabase.from('pending_registrations').delete().lt('expires_at', now),
      supabase.from('sessions').delete().lt('expires_at', now),
    ])
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single()
    if (error) { if (error.code === 'PGRST116') return null; dbErr('getUserById', error) }
    return mapUser(data as Record<string, unknown>)
  }

  async getUsersByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return []
    const unique = [...new Set(ids)]
    const { data, error } = await supabase.from('users').select('*').in('id', unique)
    if (error) dbErr('getUsersByIds', error)
    return ((data ?? []) as Record<string, unknown>[]).map(mapUser)
  }

  async getUserByDiscordId(discordId: string): Promise<User | null> {
    const { data, error } = await supabase.from('users').select('*').eq('discord_id', discordId).single()
    if (error) { if (error.code === 'PGRST116') return null; dbErr('getUserByDiscordId', error) }
    return mapUser(data as Record<string, unknown>)
  }

  async createUser(data: CreateUserData): Promise<User> {
    const { data: row, error } = await supabase.from('users').insert({
      discord_id: data.discordId ?? null,
      discord_username: data.discordUsername ?? null,
      discord_avatar: data.discordAvatar ?? null,
      display_name: data.displayName ?? null,
      permissions: data.permissions ?? '',
      login_passkey_enabled: true,
      login_discord_enabled: true,
      login_magic_enabled: true,
      login_qr_enabled: true,
    }).select().single()
    if (error) dbErr('createUser', error)
    return mapUser(row as Record<string, unknown>)
  }

  async updateUser(id: string, data: UpdateUserData): Promise<User> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (data.discordId !== undefined) update.discord_id = data.discordId
    if (data.discordUsername !== undefined) update.discord_username = data.discordUsername
    if (data.discordAvatar !== undefined) update.discord_avatar = data.discordAvatar
    if (data.displayName !== undefined) update.display_name = data.displayName
    if (data.permissions !== undefined) update.permissions = data.permissions
    if (data.isActive !== undefined) update.is_active = data.isActive
    if (data.loginPasskeyEnabled !== undefined) update.login_passkey_enabled = data.loginPasskeyEnabled
    if (data.loginDiscordEnabled !== undefined) update.login_discord_enabled = data.loginDiscordEnabled
    if (data.loginMagicEnabled !== undefined) update.login_magic_enabled = data.loginMagicEnabled
    if (data.loginQrEnabled !== undefined) update.login_qr_enabled = data.loginQrEnabled
    if (data.welcomeWizardCompletedAt !== undefined) {
      update.welcome_wizard_completed_at =
        data.welcomeWizardCompletedAt === null ? null : data.welcomeWizardCompletedAt.toISOString()
    }
    const { data: row, error } = await supabase.from('users').update(update).eq('id', id).select().single()
    if (error) dbErr('updateUser', error)
    return mapUser(row as Record<string, unknown>)
  }

  async deleteUser(id: string): Promise<void> {
    const { error } = await supabase.from('users').delete().eq('id', id)
    if (error) dbErr('deleteUser', error)
  }

  async listUsersForAdmin(opts: {
    limit: number
    offset: number
    search?: string
  }): Promise<{ users: User[]; total: number }> {
    const { limit, offset, search } = opts
    let query = supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    const term = search?.trim()
    if (term) {
      const pattern = `%${term.replace(/%/g, '')}%`
      query = query.or(`discord_username.ilike.${pattern},display_name.ilike.${pattern}`)
    }
    const { data, error, count } = await query.range(offset, offset + limit - 1)
    if (error) dbErr('listUsersForAdmin', error)
    const rows = (data ?? []) as Record<string, unknown>[]
    return {
      users: rows.map(mapUser),
      total: count ?? rows.length,
    }
  }

  async listUserIdAndPermissions(): Promise<{ id: string; permissions: string }[]> {
    const { data, error } = await supabase.from('users').select('id, permissions')
    if (error) dbErr('listUserIdAndPermissions', error)
    const rows = (data ?? []) as { id: string; permissions: string }[]
    return rows
  }

  // ── Invite codes ───────────────────────────────────────────────────────────

  async getInviteCode(code: string): Promise<InviteCode | null> {
    const { data, error } = await supabase.from('invite_codes').select('*').eq('code', code).single()
    if (error) { if (error.code === 'PGRST116') return null; dbErr('getInviteCode', error) }
    return mapInviteCode(data as Record<string, unknown>)
  }

  async getInviteCodeById(id: string): Promise<InviteCode | null> {
    const { data, error } = await supabase.from('invite_codes').select('*').eq('id', id).single()
    if (error) { if (error.code === 'PGRST116') return null; dbErr('getInviteCodeById', error) }
    return mapInviteCode(data as Record<string, unknown>)
  }

  async listInviteCodes(): Promise<InviteCode[]> {
    const { data, error } = await supabase.from('invite_codes').select('*').order('created_at', { ascending: false })
    if (error) dbErr('listInviteCodes', error)
    return (data as Record<string, unknown>[]).map(mapInviteCode)
  }

  async createInviteCode(data: CreateInviteCodeData): Promise<InviteCode> {
    const { data: row, error } = await supabase.from('invite_codes').insert({
      code: data.code,
      created_by: data.createdBy,
      expires_at: data.expiresAt?.toISOString() ?? null,
      permissions: data.permissions ?? '',
    }).select().single()
    if (error) dbErr('createInviteCode', error)
    return mapInviteCode(row as Record<string, unknown>)
  }

  async markInviteCodeUsed(id: string, usedBy?: string | null): Promise<void> {
    const update: Record<string, unknown> = {
      is_used: true,
      used_at: new Date().toISOString(),
    }
    if (usedBy != null) {
      update.used_by = usedBy
    }
    const { error } = await supabase.from('invite_codes').update(update).eq('id', id)
    if (error) dbErr('markInviteCodeUsed', error)
  }

  async setInviteCodeUsedByUser(inviteCodeId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('invite_codes')
      .update({ used_by: userId })
      .eq('id', inviteCodeId)
    if (error) dbErr('setInviteCodeUsedByUser', error)
  }

  async deleteInviteCode(id: string): Promise<void> {
    const { error } = await supabase.from('invite_codes').delete().eq('id', id)
    if (error) dbErr('deleteInviteCode', error)
  }

  async atomicClaimInviteCode(code: string): Promise<InviteCode | null> {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('invite_codes')
      .update({ is_used: true, used_at: now })
      .eq('code', code)
      .eq('is_used', false)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .select()
      .single()
    if (error) {
      if (error.code === 'PGRST116') return null
      dbErr('atomicClaimInviteCode', error)
    }
    return mapInviteCode(data as Record<string, unknown>)
  }

  // ── Passkeys ───────────────────────────────────────────────────────────────

  async getPasskeyByCredentialId(credentialId: string): Promise<PasskeyCredential | null> {
    const { data, error } = await supabase.from('passkey_credentials').select('*').eq('credential_id', credentialId).single()
    if (error) { if (error.code === 'PGRST116') return null; dbErr('getPasskeyByCredentialId', error) }
    return mapPasskey(data as Record<string, unknown>)
  }

  async getPasskeysByUserId(userId: string): Promise<PasskeyCredential[]> {
    const { data, error } = await supabase.from('passkey_credentials').select('*').eq('user_id', userId)
    if (error) dbErr('getPasskeysByUserId', error)
    return (data as Record<string, unknown>[]).map(mapPasskey)
  }

  async createPasskeyCredential(data: CreatePasskeyData): Promise<PasskeyCredential> {
    const { data: row, error } = await supabase.from('passkey_credentials').insert({
      user_id: data.userId,
      credential_id: data.credentialId,
      public_key: data.publicKey,
      counter: data.counter,
      device_type: data.deviceType,
      backed_up: data.backedUp,
      transports: data.transports ?? null,
      name: data.name ?? null,
    }).select().single()
    if (error) dbErr('createPasskeyCredential', error)
    return mapPasskey(row as Record<string, unknown>)
  }

  async updatePasskeyCounter(id: string, counter: number): Promise<void> {
    const { error } = await supabase.from('passkey_credentials').update({
      counter,
      last_used_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) dbErr('updatePasskeyCounter', error)
  }

  async deletePasskeyCredential(id: string): Promise<void> {
    const { error } = await supabase.from('passkey_credentials').delete().eq('id', id)
    if (error) dbErr('deletePasskeyCredential', error)
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  async createSession(data: CreateSessionData): Promise<Session> {
    const { data: row, error } = await supabase.from('sessions').insert({
      user_id: data.userId,
      refresh_token_hash: data.refreshTokenHash,
      is_pwa: data.isPwa,
      expires_at: data.expiresAt.toISOString(),
      ip_address: data.ipAddress ?? null,
      user_agent: data.userAgent ?? null,
    }).select().single()
    if (error) dbErr('createSession', error)
    return mapSession(row as Record<string, unknown>)
  }

  async getSessionById(id: string): Promise<Session | null> {
    const { data, error } = await supabase.from('sessions').select('*').eq('id', id).single()
    if (error) { if (error.code === 'PGRST116') return null; dbErr('getSessionById', error) }
    return mapSession(data as Record<string, unknown>)
  }

  async getSessionByTokenHash(hash: string): Promise<Session | null> {
    const { data, error } = await supabase.from('sessions').select('*').eq('refresh_token_hash', hash).single()
    if (error) { if (error.code === 'PGRST116') return null; dbErr('getSessionByTokenHash', error) }
    return mapSession(data as Record<string, unknown>)
  }

  async rotateSession(id: string, oldHash: string, newHash: string, newExpiresAt: Date): Promise<Session | null> {
    const { data: row, error } = await supabase.from('sessions').update({
      refresh_token_hash: newHash,
      expires_at: newExpiresAt.toISOString(),
      last_used_at: new Date().toISOString(),
    }).eq('id', id).eq('refresh_token_hash', oldHash).select().single()
    if (error) {
      if (error.code === 'PGRST116') return null
      dbErr('rotateSession', error)
    }
    return mapSession(row as Record<string, unknown>)
  }

  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase.from('sessions').delete().eq('id', id)
    if (error) dbErr('deleteSession', error)
  }

  async deleteUserSessions(userId: string): Promise<void> {
    const { error } = await supabase.from('sessions').delete().eq('user_id', userId)
    if (error) dbErr('deleteUserSessions', error)
  }

  // ── Magic tokens ───────────────────────────────────────────────────────────

  async getMagicToken(tokenHash: string): Promise<MagicToken | null> {
    const { data, error } = await supabase.from('magic_tokens').select('*').eq('token_hash', tokenHash).single()
    if (error) { if (error.code === 'PGRST116') return null; dbErr('getMagicToken', error) }
    return mapMagicToken(data as Record<string, unknown>)
  }

  async createMagicToken(data: CreateMagicTokenData): Promise<MagicToken> {
    const { data: row, error } = await supabase.from('magic_tokens').insert({
      token_hash: data.tokenHash,
      discord_id: data.discordId,
      user_id: data.userId ?? null,
      expires_at: data.expiresAt.toISOString(),
    }).select().single()
    if (error) dbErr('createMagicToken', error)
    return mapMagicToken(row as Record<string, unknown>)
  }

  async markMagicTokenUsed(id: string): Promise<void> {
    const { error } = await supabase.from('magic_tokens').update({
      is_used: true,
      used_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) dbErr('markMagicTokenUsed', error)
  }

  async consumeMagicToken(tokenHash: string): Promise<MagicToken | null> {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('magic_tokens')
      .update({ is_used: true, used_at: now })
      .eq('token_hash', tokenHash)
      .eq('is_used', false)
      .gt('expires_at', now)
      .select()
      .single()
    if (error) {
      if (error.code === 'PGRST116') return null
      dbErr('consumeMagicToken', error)
    }
    return mapMagicToken(data as Record<string, unknown>)
  }

  // ── QR sessions ────────────────────────────────────────────────────────────

  async createQRSession(data: CreateQRSessionData): Promise<QRLoginSession> {
    const { data: row, error } = await supabase.from('qr_login_sessions').insert({
      totp_secret_encrypted: data.totpSecretEncrypted,
      desktop_ip: data.desktopIp ?? null,
      desktop_user_agent: data.desktopUserAgent ?? null,
      desktop_location: data.desktopLocation ?? null,
      expires_at: data.expiresAt.toISOString(),
    }).select().single()
    if (error) dbErr('createQRSession', error)
    return mapQRSession(row as Record<string, unknown>)
  }

  async getQRSession(id: string): Promise<QRLoginSession | null> {
    const { data, error } = await supabase.from('qr_login_sessions').select('*').eq('id', id).single()
    if (error) { if (error.code === 'PGRST116') return null; dbErr('getQRSession', error) }
    return mapQRSession(data as Record<string, unknown>)
  }

  async finalizeQRSession(sessionId: string): Promise<QRLoginSession | null> {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('qr_login_sessions')
      .update({ status: 'expired', resolved_at: now })
      .eq('id', sessionId)
      .eq('status', 'approved')
      .select()
      .single()
    if (error) {
      if (error.code === 'PGRST116') return null
      dbErr('finalizeQRSession', error)
    }
    return mapQRSession(data as Record<string, unknown>)
  }

  async updateQRSessionStatus(
    id: string,
    status: QRSessionStatus,
    data?: { mobileUserId?: string; scannedAt?: Date; resolvedAt?: Date }
  ): Promise<void> {
    const update: Record<string, unknown> = { status }
    if (data?.mobileUserId) update.mobile_user_id = data.mobileUserId
    if (data?.scannedAt) update.scanned_at = data.scannedAt.toISOString()
    if (data?.resolvedAt) update.resolved_at = data.resolvedAt.toISOString()
    const { error } = await supabase.from('qr_login_sessions').update(update).eq('id', id)
    if (error) dbErr('updateQRSessionStatus', error)
  }

  // ── WebAuthn challenges ────────────────────────────────────────────────────

  async createChallenge(data: CreateChallengeData): Promise<WebAuthnChallenge> {
    const { data: row, error } = await supabase.from('webauthn_challenges').insert({
      challenge: data.challenge,
      user_id: data.userId ?? null,
      type: data.type,
      expires_at: data.expiresAt.toISOString(),
    }).select().single()
    if (error) dbErr('createChallenge', error)
    return mapChallenge(row as Record<string, unknown>)
  }

  async getChallengeByValue(challenge: string): Promise<WebAuthnChallenge | null> {
    const { data, error } = await supabase.from('webauthn_challenges').select('*').eq('challenge', challenge).single()
    if (error) { if (error.code === 'PGRST116') return null; dbErr('getChallengeByValue', error) }
    return mapChallenge(data as Record<string, unknown>)
  }

  async deleteChallenge(id: string): Promise<void> {
    const { error } = await supabase.from('webauthn_challenges').delete().eq('id', id)
    if (error) dbErr('deleteChallenge', error)
  }

  // ── Pending registrations ──────────────────────────────────────────────────

  async createPendingRegistration(data: CreatePendingRegistrationData): Promise<PendingRegistration> {
    const { data: row, error } = await supabase.from('pending_registrations').insert({
      invite_code_id: data.inviteCodeId,
      registration_token: data.registrationToken,
      expires_at: data.expiresAt.toISOString(),
    }).select().single()
    if (error) dbErr('createPendingRegistration', error)
    return mapPendingReg(row as Record<string, unknown>)
  }

  async getPendingRegistration(token: string): Promise<PendingRegistration | null> {
    const { data, error } = await supabase.from('pending_registrations').select('*').eq('registration_token', token).single()
    if (error) { if (error.code === 'PGRST116') return null; dbErr('getPendingRegistration', error) }
    return mapPendingReg(data as Record<string, unknown>)
  }

  async deletePendingRegistration(id: string): Promise<void> {
    const { error } = await supabase.from('pending_registrations').delete().eq('id', id)
    if (error) dbErr('deletePendingRegistration', error)
  }

  async consumePendingRegistration(id: string): Promise<PendingRegistration | null> {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('pending_registrations')
      .delete()
      .eq('id', id)
      .gt('expires_at', now)
      .select()
      .single()
    if (error) {
      if (error.code === 'PGRST116') return null
      dbErr('consumePendingRegistration', error)
    }
    return mapPendingReg(data as Record<string, unknown>)
  }

  async abortPendingRegistrationAndReleaseInvite(registrationToken: string): Promise<void> {
    const pending = await this.getPendingRegistration(registrationToken)
    if (!pending) return

    const invite = await this.getInviteCodeById(pending.inviteCodeId)
    if (!invite || invite.usedBy != null) return

    await this.deletePendingRegistration(pending.id)

    const { error } = await supabase
      .from('invite_codes')
      .update({
        is_used: false,
        used_at: null,
        used_by: null,
      })
      .eq('id', pending.inviteCodeId)
      .is('used_by', null)

    if (error) dbErr('abortPendingRegistrationAndReleaseInvite', error)
  }
}
