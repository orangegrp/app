/** First 8 chars of user id — consistent fallback label across the app */
export function shortUserId(id: string): string {
  return id.slice(0, 8)
}

export function userDisplayName(
  user: { id: string; displayName?: string | null; discordUsername?: string } | null | undefined,
): string {
  if (!user?.id) return ''
  const custom = user.displayName?.trim()
  if (custom) return custom
  const discord = user.discordUsername?.trim()
  if (discord) return discord
  return shortUserId(user.id)
}
