import { useAuthStore } from '@/lib/auth-store'

/** Loads Discord profile fields from GET /api/me and merges into the auth store. */
export async function fetchAndMergeUserProfile(accessToken: string): Promise<boolean> {
  const res = await fetch('/api/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  if (!res.ok) return false
  const data = (await res.json()) as {
    discordUsername?: string
    discordAvatar?: string
    displayName?: string | null
    discordId?: string | null
    loginPasskeyEnabled?: boolean
    loginDiscordEnabled?: boolean
    loginMagicEnabled?: boolean
    loginQrEnabled?: boolean
    passkeyCount?: number
    welcomeWizardCompleted?: boolean
  }
  useAuthStore.getState().mergeAuthUser({
    discordUsername: data.discordUsername,
    discordAvatar: data.discordAvatar,
    displayName: data.displayName,
    discordId: data.discordId,
    loginPasskeyEnabled: data.loginPasskeyEnabled,
    loginDiscordEnabled: data.loginDiscordEnabled,
    loginMagicEnabled: data.loginMagicEnabled,
    loginQrEnabled: data.loginQrEnabled,
    passkeyCount: data.passkeyCount,
    welcomeWizardCompleted: data.welcomeWizardCompleted,
  })
  return true
}
