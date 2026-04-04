import 'server-only'
import { Hono } from 'hono'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { rateLimitByUser } from '@/server/middleware/rate-limit'
import { PERMISSIONS } from '@/lib/permissions'
import {
  MUSIC_AUDIO_ALLOWED_TYPES,
  MUSIC_AUDIO_MAX_SIZE,
  MUSIC_COVER_ALLOWED_TYPES,
  MUSIC_COVER_MAX_SIZE,
  MUSIC_LYRICS_MAX_SIZE,
  uploadMusicAudio,
  uploadMusicCover,
  uploadMusicLyrics,
} from '@/server/lib/music-upload'
import { supabase } from '@/server/db/supabase/client'
import type { HonoEnv, MusicTrack } from '@/server/lib/types'

export const musicTrackRoutes = new Hono<HonoEnv>()
musicTrackRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.APP_MUSIC))

// GET /music/tracks — list all music tracks, optional ?genre= filter
musicTrackRoutes.get('/', async (c) => {
  const genre = c.req.query('genre')

  let query = supabase
    .from('music_tracks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (genre) {
    query = query.eq('genre', genre)
  }

  const { data, error } = await query

  if (error) {
    console.error('[music/tracks] list error:', error)
    return c.json({ error: 'Failed to fetch tracks' }, 500)
  }

  const tracks: MusicTrack[] = (data ?? []).map(rowToMusicTrack)
  return c.json({ tracks })
})

// POST /music/tracks — upload a new music track
musicTrackRoutes.post(
  '/',
  requirePermission(PERMISSIONS.APP_MUSIC_UPLOAD),
  rateLimitByUser(5, 60_000),
  async (c) => {
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return c.json({ error: 'Expected multipart/form-data' }, 400)
    }

    const audioFile = formData.get('audio')
    if (!(audioFile instanceof File)) {
      return c.json({ error: 'Missing audio file' }, 400)
    }

    if (!MUSIC_AUDIO_ALLOWED_TYPES.has(audioFile.type)) {
      return c.json({ error: `Unsupported audio type: ${audioFile.type}` }, 400)
    }
    if (audioFile.size > MUSIC_AUDIO_MAX_SIZE) {
      return c.json({ error: 'Audio file exceeds 100 MB limit' }, 400)
    }

    const titleRaw = formData.get('title')
    if (typeof titleRaw !== 'string' || !titleRaw.trim()) {
      return c.json({ error: 'Missing title' }, 400)
    }
    const artistRaw = formData.get('artist')
    if (typeof artistRaw !== 'string' || !artistRaw.trim()) {
      return c.json({ error: 'Missing artist' }, 400)
    }

    const title = titleRaw.trim().slice(0, 200)
    const artist = artistRaw.trim().slice(0, 200)
    const genreRaw = formData.get('genre')
    const genre = typeof genreRaw === 'string' && genreRaw.trim() ? genreRaw.trim().slice(0, 100) : null
    const durationRaw = formData.get('duration_sec')
    const durationSec = typeof durationRaw === 'string' ? Math.max(0, Math.round(Number(durationRaw))) : 0

    const coverFile = formData.get('cover')
    const lyricsFile = formData.get('lyrics')

    // Validate cover if provided
    if (coverFile instanceof File) {
      if (!MUSIC_COVER_ALLOWED_TYPES.has(coverFile.type)) {
        return c.json({ error: `Unsupported cover art type: ${coverFile.type}` }, 400)
      }
      if (coverFile.size > MUSIC_COVER_MAX_SIZE) {
        return c.json({ error: 'Cover art exceeds 5 MB limit' }, 400)
      }
    }

    // Validate lyrics if provided
    if (lyricsFile instanceof File) {
      if (lyricsFile.size > MUSIC_LYRICS_MAX_SIZE) {
        return c.json({ error: 'Lyrics file exceeds 1 MB limit' }, 400)
      }
      // Accept text/plain or application/octet-stream (common for .lrc files)
      const validLyricsMime = lyricsFile.type === 'text/plain' ||
        lyricsFile.type === 'application/octet-stream' ||
        lyricsFile.name.toLowerCase().endsWith('.lrc') ||
        lyricsFile.name.toLowerCase().endsWith('.txt')
      if (!validLyricsMime) {
        return c.json({ error: 'Lyrics must be a .lrc or .txt file' }, 400)
      }
    }

    const user = c.get('user')
    const uploadedStorageKeys: string[] = []

    try {
      // Upload audio (required)
      const audioBuffer = await audioFile.arrayBuffer()
      const { storageKey: audioKey, publicUrl: audioUrl } = await uploadMusicAudio({
        userId: user.id,
        buffer: audioBuffer,
        contentType: audioFile.type,
        filenameHint: audioFile.name,
      })
      uploadedStorageKeys.push(audioKey)

      // Upload cover (optional)
      let coverKey: string | null = null
      let coverUrl: string | null = null
      if (coverFile instanceof File) {
        const coverBuffer = await coverFile.arrayBuffer()
        const result = await uploadMusicCover({
          userId: user.id,
          buffer: coverBuffer,
          contentType: coverFile.type,
          filenameHint: coverFile.name,
        })
        coverKey = result.storageKey
        coverUrl = result.publicUrl
        uploadedStorageKeys.push(coverKey)
      }

      // Upload lyrics (optional)
      let lyricsKey: string | null = null
      let lyricsUrl: string | null = null
      let lyricsType: 'lrc' | 'txt' | null = null
      if (lyricsFile instanceof File) {
        const lyricsBuffer = await lyricsFile.arrayBuffer()
        const result = await uploadMusicLyrics({
          userId: user.id,
          buffer: lyricsBuffer,
          contentType: lyricsFile.type,
          filenameHint: lyricsFile.name,
        })
        lyricsKey = result.storageKey
        lyricsUrl = result.publicUrl
        lyricsType = lyricsFile.name.toLowerCase().endsWith('.lrc') ? 'lrc' : 'txt'
        uploadedStorageKeys.push(lyricsKey)
      }

      const { data, error } = await supabase
        .from('music_tracks')
        .insert({
          uploaded_by: user.id,
          title,
          artist,
          genre,
          duration_sec: durationSec,
          audio_key: audioKey,
          audio_url: audioUrl,
          cover_key: coverKey,
          cover_url: coverUrl,
          lyrics_key: lyricsKey,
          lyrics_url: lyricsUrl,
          lyrics_type: lyricsType,
        })
        .select()
        .single()

      if (error || !data) {
        // Best-effort cleanup of orphaned storage objects
        await supabase.storage.from('music-tracks').remove(uploadedStorageKeys).catch(() => {})
        console.error('[music/tracks] insert error:', error)
        return c.json({ error: 'Failed to save track' }, 500)
      }

      return c.json({ track: rowToMusicTrack(data) }, 201)
    } catch (err) {
      // Best-effort cleanup
      if (uploadedStorageKeys.length > 0) {
        await supabase.storage.from('music-tracks').remove(uploadedStorageKeys).catch(() => {})
      }
      console.error('[music/tracks] upload error:', err)
      return c.json({ error: 'Upload failed' }, 500)
    }
  }
)

// DELETE /music/tracks/:id — delete a track (own items only, or superuser)
musicTrackRoutes.delete(
  '/:id',
  requirePermission(PERMISSIONS.APP_MUSIC_UPLOAD),
  async (c) => {
    const id = c.req.param('id')
    const user = c.get('user')

    const { data, error } = await supabase
      .from('music_tracks')
      .select('id, audio_key, cover_key, lyrics_key, uploaded_by')
      .eq('id', id)
      .single()

    if (error || !data) {
      return c.json({ error: 'Track not found' }, 404)
    }

    const isSuperuser = user.permissions === '*'
    if (!isSuperuser && data.uploaded_by !== user.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const keysToDelete = [data.audio_key, data.cover_key, data.lyrics_key].filter(Boolean) as string[]
    if (keysToDelete.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('music-tracks')
        .remove(keysToDelete)
      if (storageError) {
        console.error('[music/tracks] storage delete error:', storageError)
      }
    }

    const { error: deleteError } = await supabase
      .from('music_tracks')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[music/tracks] db delete error:', deleteError)
      return c.json({ error: 'Delete failed' }, 500)
    }

    return c.json({ ok: true })
  }
)

// GET /music/tracks/:id/lyrics — fetch lyrics content
musicTrackRoutes.get('/:id/lyrics', async (c) => {
  const id = c.req.param('id')

  const { data, error } = await supabase
    .from('music_tracks')
    .select('lyrics_url, lyrics_type')
    .eq('id', id)
    .single()

  if (error || !data) {
    return c.json({ error: 'Track not found' }, 404)
  }

  if (!data.lyrics_url) {
    return c.json({ error: 'No lyrics available' }, 404)
  }

  try {
    const res = await fetch(data.lyrics_url)
    if (!res.ok) {
      return c.json({ error: 'Failed to fetch lyrics' }, 502)
    }
    const content = await res.text()
    return c.json({ content, type: data.lyrics_type ?? 'txt' })
  } catch (err) {
    console.error('[music/tracks] lyrics fetch error:', err)
    return c.json({ error: 'Failed to fetch lyrics' }, 500)
  }
})

function rowToMusicTrack(row: Record<string, unknown>): MusicTrack {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    uploadedBy: row.uploaded_by as string | null,
    title: row.title as string,
    artist: row.artist as string,
    genre: row.genre as string | null,
    durationSec: row.duration_sec as number,
    audioKey: row.audio_key as string,
    audioUrl: row.audio_url as string,
    coverKey: row.cover_key as string | null,
    coverUrl: row.cover_url as string | null,
    lyricsKey: row.lyrics_key as string | null,
    lyricsUrl: row.lyrics_url as string | null,
    lyricsType: row.lyrics_type as 'lrc' | 'txt' | null,
  }
}
