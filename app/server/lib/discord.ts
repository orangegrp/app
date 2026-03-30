import 'server-only'

interface DiscordUser {
  id: string
  username: string
  avatar: string | null
  discriminator: string
}

export function buildDiscordAuthUrl(state: string): string {
  const clientId = process.env.DISCORD_CLIENT_ID
  const redirectUri = process.env.DISCORD_REDIRECT_URI
  if (!clientId || !redirectUri) {
    throw new Error('Missing DISCORD_CLIENT_ID or DISCORD_REDIRECT_URI')
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
  })
  return `https://discord.com/api/oauth2/authorize?${params}`
}

export async function exchangeDiscordCode(code: string): Promise<string> {
  const clientId = process.env.DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET
  const redirectUri = process.env.DISCORD_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Discord OAuth environment variables')
  }
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status}`)
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Discord user fetch failed: ${res.status}`)
  return res.json() as Promise<DiscordUser>
}

export function getDiscordAvatarUrl(userId: string, avatar: string | null): string | undefined {
  if (!avatar) return undefined
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`
}
