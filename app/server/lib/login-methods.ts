import 'server-only'
import type { User } from '@/server/lib/types'

export type LoginMethodKey = 'passkey' | 'discord' | 'magic' | 'qr'

export function isLoginMethodAllowed(user: User, method: LoginMethodKey): boolean {
  switch (method) {
    case 'passkey':
      return user.loginPasskeyEnabled
    case 'discord':
      return user.loginDiscordEnabled
    case 'magic':
      return user.loginMagicEnabled
    case 'qr':
      return user.loginQrEnabled
    default:
      return false
  }
}

export type LoginMethodsPatch = Partial<
  Pick<User, 'loginPasskeyEnabled' | 'loginDiscordEnabled' | 'loginMagicEnabled' | 'loginQrEnabled'>
>

export function mergeLoginMethodFlags(user: User, patch: LoginMethodsPatch): LoginMethodsPatch {
  const next = {
    loginPasskeyEnabled: patch.loginPasskeyEnabled ?? user.loginPasskeyEnabled,
    loginDiscordEnabled: patch.loginDiscordEnabled ?? user.loginDiscordEnabled,
    loginMagicEnabled: patch.loginMagicEnabled ?? user.loginMagicEnabled,
    loginQrEnabled: patch.loginQrEnabled ?? user.loginQrEnabled,
  }
  if (
    !next.loginPasskeyEnabled &&
    !next.loginDiscordEnabled &&
    !next.loginMagicEnabled &&
    !next.loginQrEnabled
  ) {
    throw new Error('At least one sign-in method must remain enabled')
  }
  return next
}

/** Unlinking Discord only allowed when another method can sign the user in (passkeys). */
export function canUnlinkDiscord(passkeyCount: number): boolean {
  return passkeyCount >= 1
}
