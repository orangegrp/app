import 'server-only'
import { randomBytes } from 'crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { rateLimit } from '@/server/middleware/rate-limit'
import { PERMISSIONS } from '@/lib/permissions'
import { db } from '@/server/db'
import { supabase } from '@/server/db/supabase/client'
import { signMusicGetUrls } from '@/server/lib/music-r2'
import type { HonoEnv, MusicTrack } from '@/server/lib/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateShareToken(): string {
  return randomBytes(32).toString('base64url')
}

function computeExpiresAt(expiresIn: '24h' | '7d' | 'never'): Date | null {
  if (expiresIn === 'never') return null
  const ms = expiresIn === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  return new Date(Date.now() + ms)
}

function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.332.fm'
}

function rowToMusicTrack(row: Record<string, unknown>): MusicTrack {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    uploadedBy: row.uploaded_by as string | null,
    title: row.title as string,
    artist: row.artist as string,
    album: (row.album as string | null) ?? null,
    genre: row.genre as string | null,
    durationSec: row.duration_sec as number,
    audioKey: row.audio_key as string,
    audioUrl: row.audio_url as string,
    coverKey: row.cover_key as string | null,
    coverUrl: row.cover_url as string | null,
    lyricsKey: row.lyrics_key as string | null,
    lyricsUrl: row.lyrics_url as string | null,
    lyricsType: row.lyrics_type as 'lrc' | 'txt' | null,
    transliteratedLyricsKey: row.transliterated_lyrics_key as string | null,
    transliteratedLyricsUrl: row.transliterated_lyrics_url as string | null,
    transliteratedLyricsType: row.transliterated_lyrics_type as 'lrc' | 'txt' | null,
  }
}

// ── Authenticated router — create share links ─────────────────────────────────
// Mounted at /music/tracks (alongside musicTrackRoutes).

export const musicShareAuthRoutes = new Hono<HonoEnv>()
musicShareAuthRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.APP_MUSIC))

const createShareSchema = z.object({
  expiresIn: z.enum(['24h', '7d', 'never']),
})

musicShareAuthRoutes.post('/:id/share', async (c) => {
  const trackId = c.req.param('id')
  const authUser = c.get('user')

  const body = await c.req.json().catch(() => null)
  const parsed = createShareSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  // Verify track exists and user has access (all app.music users can share)
  const { data: trackRow, error: trackError } = await supabase
    .from('music_tracks')
    .select('id, title')
    .eq('id', trackId)
    .single()

  if (trackError || !trackRow) return c.json({ error: 'Track not found' }, 404)

  const token = generateShareToken()
  const expiresAt = computeExpiresAt(parsed.data.expiresIn)

  const link = await db.createMusicShareLink({
    token,
    trackId,
    createdBy: authUser.id,
    expiresAt,
  })

  const shareUrl = `${getAppBaseUrl()}/share/${token}`

  return c.json({ token: link.token, shareUrl, expiresAt: link.expiresAt }, 201)
})

// ── Public router — resolve share links ───────────────────────────────────────
// Mounted at /music/share (no auth middleware).

export const musicSharePublicRoutes = new Hono<HonoEnv>()

// Rate-limit public share lookups: 60 req/min per IP to prevent token enumeration
musicSharePublicRoutes.use('*', rateLimit(60, 60_000))

musicSharePublicRoutes.get('/:token', async (c) => {
  const token = c.req.param('token')

  // Validate token format — base64url, 43 chars
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return c.json({ error: 'Invalid share link' }, 404)
  }

  const link = await db.getMusicShareLinkByToken(token)
  if (!link) return c.json({ error: 'Share link not found or expired' }, 404)

  const { data: trackRow, error: trackError } = await supabase
    .from('music_tracks')
    .select('*')
    .eq('id', link.trackId)
    .single()

  if (trackError || !trackRow) return c.json({ error: 'Track not found' }, 404)

  const track = rowToMusicTrack(trackRow as Record<string, unknown>)

  const keysToSign = [
    track.audioKey,
    track.coverKey ?? null,
    track.lyricsKey ?? null,
    track.transliteratedLyricsKey ?? null,
  ].filter(Boolean) as string[]
  const signed = await signMusicGetUrls(keysToSign, 3600)

  return c.json({
    track: {
      id: track.id,
      title: track.title,
      artist: track.artist,
      genre: track.genre ?? null,
      durationSec: track.durationSec,
      audioUrl: signed.get(track.audioKey) ?? track.audioUrl,
      coverUrl: track.coverKey ? (signed.get(track.coverKey) ?? track.coverUrl) : track.coverUrl,
      lyricsUrl: track.lyricsKey
        ? (signed.get(track.lyricsKey) ?? track.lyricsUrl)
        : track.lyricsUrl,
      lyricsType: track.lyricsType ?? null,
      transliteratedLyricsUrl: track.transliteratedLyricsKey
        ? (signed.get(track.transliteratedLyricsKey) ?? track.transliteratedLyricsUrl)
        : track.transliteratedLyricsUrl,
      transliteratedLyricsType: track.transliteratedLyricsType ?? null,
    },
    expiresAt: link.expiresAt,
  })
})
